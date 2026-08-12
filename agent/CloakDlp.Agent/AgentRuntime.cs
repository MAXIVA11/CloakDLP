using System.Net.Http.Json;
using System.Text.Json.Serialization;
using CloakDlp.Agent.Channels;
using CloakDlp.Agent.Config;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using Microsoft.Extensions.Configuration;

namespace CloakDlp.Agent;

// Shared setup + channel-watching loop used by both the interactive `monitor` command and the
// Windows Service worker; the two have identical behavior, just different hosts/lifecycles.
public static class AgentRuntime
{
    public static async Task<AgentConfig> LoadConfigAsync()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: false)
            .AddEnvironmentVariables(prefix: "CLOAKDLP_")
            .Build();

        var config = new AgentConfig();
        configuration.Bind(config);

        if (string.IsNullOrWhiteSpace(config.AgentId) || string.IsNullOrWhiteSpace(config.ApiKey))
        {
            // Everything in this branch pairs via self-register, one way or another; gates
            // HeartbeatLoopAsync's policy-id refresh so it never overwrites an operator's own
            // manually-configured PolicyIdsByDataType (appsettings.json with AgentId/ApiKey
            // already filled in skips this whole branch, leaving the flag false).
            config.IsZeroConfigPairing = true;

            var stored = AgentCredentialStore.Load();

            // A stored file written before DefaultCreditCardPolicyId existed (or one saved back
            // when the console had no credit-card policy yet) has it null/empty; self-register
            // is idempotent per (hostname, kind) so re-running it is safe and is the only way to
            // pick that value up, rather than staying permanently unable to report credit-card
            // incidents just because the very first pairing attempt predates this field.
            if (stored is { DefaultCreditCardPolicyId: { Length: > 0 } } creds)
            {
                config.AgentId = creds.AgentId;
                config.ApiKey = creds.ApiKey;
                ApplyDefaultCreditCardPolicy(config, creds.DefaultCreditCardPolicyId);
            }
            else
            {
                var registered = await SelfRegisterAsync(config.ConsoleUrl);
                if (registered is { } issued)
                {
                    config.AgentId = issued.AgentId;
                    config.ApiKey = issued.ApiKey;
                    ApplyDefaultCreditCardPolicy(config, issued.DefaultCreditCardPolicyId);
                    AgentCredentialStore.Save(issued.AgentId, issued.ApiKey, issued.DefaultCreditCardPolicyId);
                    Console.WriteLine($"[pairing] self-registered as '{Environment.MachineName}' with the console at {config.ConsoleUrl}.");
                }
                else if (stored is { } fallback)
                {
                    // Console unreachable right now (e.g. still starting up); fall back to the
                    // old stored pairing rather than running fully unpaired, even without a
                    // refreshed policy id.
                    config.AgentId = fallback.AgentId;
                    config.ApiKey = fallback.ApiKey;
                    ApplyDefaultCreditCardPolicy(config, fallback.DefaultCreditCardPolicyId);
                }
            }
        }

        return config;
    }

    private static void ApplyDefaultCreditCardPolicy(AgentConfig config, string? policyId)
    {
        if (string.IsNullOrWhiteSpace(policyId)) return;
        if (!config.PolicyIdsByDataType.TryGetValue("credit_card", out var existing) || string.IsNullOrWhiteSpace(existing))
            config.PolicyIdsByDataType["credit_card"] = policyId;
    }

    // Every heartbeat carries the console's current default_credit_card_policy_id (see
    // routers/agents.py::_agent_out); this is how a zero-config-paired agent ever learns that
    // value changed after its one-time self-register - disabled, replaced, or edited - since
    // nothing else ever prompts it to look again. Never runs for a manually-configured agent
    // (IsZeroConfigPairing false): an operator's own PolicyIdsByDataType entry is deliberate and
    // must never get silently overwritten by what the console happens to think the default is.
    private static void RefreshCreditCardPolicyIfChanged(AgentConfig config, string? newPolicyId)
    {
        if (!config.IsZeroConfigPairing) return;

        config.PolicyIdsByDataType.TryGetValue("credit_card", out var current);
        if (newPolicyId == current) return;

        if (string.IsNullOrWhiteSpace(newPolicyId))
            config.PolicyIdsByDataType.Remove("credit_card");
        else
            config.PolicyIdsByDataType["credit_card"] = newPolicyId;

        AgentCredentialStore.Save(config.AgentId, config.ApiKey, newPolicyId);
        Console.WriteLine($"[pairing] console's credit-card policy changed; now using {newPolicyId ?? "(none configured)"}.");
    }

    private static async Task<(string AgentId, string ApiKey, string? DefaultCreditCardPolicyId)?> SelfRegisterAsync(string consoleUrl)
    {
        try
        {
            using var http = new HttpClient { BaseAddress = new Uri(consoleUrl), Timeout = TimeSpan.FromSeconds(10) };
            var response = await http.PostAsJsonAsync("/api/agents/self-register", new { hostname = Environment.MachineName });
            if (!response.IsSuccessStatusCode) return null;

            var result = await response.Content.ReadFromJsonAsync<SelfRegisterResponse>();
            return result is null ? null : (result.Id, result.ApiKey, result.DefaultCreditCardPolicyId);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[pairing] self-registration failed (console may not be up yet): {ex.Message}");
            return null;
        }
    }

    private sealed class SelfRegisterResponse
    {
        public string Id { get; set; } = "";
        [JsonPropertyName("api_key")]
        public string ApiKey { get; set; } = "";
        [JsonPropertyName("default_credit_card_policy_id")]
        public string? DefaultCreditCardPolicyId { get; set; }
    }

    // includeClipboard is false for the Windows Service: Session 0 isolation means a service
    // literally cannot receive WM_CLIPBOARDUPDATE from the interactive desktop session, no
    // matter how correct the listener code is (confirmed empirically - the installed service
    // logged "monitoring started" and then nothing, ever, even with a valid card number placed
    // on the clipboard). Clipboard detection now runs from CloakDlp.Tray instead, which is a
    // per-user process in the right session. Left true for the interactive `monitor` command
    // (dev/testing only), where it does work correctly.
    public static async Task RunChannelsAsync(AgentConfig config, CancellationToken ct, bool includeClipboard = true)
    {
        if (string.IsNullOrWhiteSpace(config.AgentId) || string.IsNullOrWhiteSpace(config.ApiKey))
        {
            Console.Error.WriteLine("Agent is not paired with a console yet (self-registration hasn't succeeded; is the console running?).");
            return;
        }

        using var client = new ConsoleApiClient(config);
        var reporter = new IncidentReporter(client, config.PolicyIdsByDataType);
        var pipeline = new DetectorPipeline(await LoadEdmDetectorsAsync(client, config));
        var fingerprintMatcher = new FingerprintMatcher(await LoadFingerprintReferencesAsync(client, config), config.FingerprintThreshold);

        var initialHeartbeat = await client.HeartbeatAsync("phase4-v1", ct);
        if (!initialHeartbeat.Success)
        {
            // Stored credentials don't correspond to any agent the console currently knows
            // about (its database was reset, or this record was deleted); retrying the same
            // dead credentials forever would just heartbeat-fail silently forever. Clearing
            // the store makes the next pairing attempt (30s later, via the outer retry loop)
            // self-register fresh instead. Only meaningful when credentials came from that
            // store in the first place; if they were hardcoded in appsettings.json this is a
            // harmless no-op and the same failure will keep showing up in the logs until a
            // human fixes the config.
            Console.Error.WriteLine("[pairing] console rejected our credentials; clearing stored pairing and re-registering.");
            AgentCredentialStore.Clear();
            return;
        }
        RefreshCreditCardPolicyIfChanged(config, initialHeartbeat.DefaultCreditCardPolicyId);

        Console.WriteLine(includeClipboard
            ? $"CloakDLP agent monitoring: clipboard, print, network (proxy on port {config.ProxyPort})."
            : $"CloakDLP agent monitoring: print, network (proxy on port {config.ProxyPort}). Clipboard is handled by the tray notifier instead (Session 0 can't see it from here).");

        var print = new PrintMonitor(pipeline, reporter);
        var proxy = new NetworkProxyMonitor(pipeline, reporter, config.ProxyPort, fingerprintMatcher);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct);

        var tasks = new List<Task>
        {
            Task.Run(() => print.RunAsync(linkedCts.Token), linkedCts.Token),
            Task.Run(() => proxy.RunAsync(linkedCts.Token), linkedCts.Token),
            Task.Run(() => HeartbeatLoopAsync(client, config, linkedCts), linkedCts.Token),
        };

        if (includeClipboard)
        {
            var clipboard = new ClipboardMonitor(pipeline, reporter);
            tasks.Add(Task.Run(() => clipboard.Run(linkedCts.Token), linkedCts.Token));
        }

        try
        {
            await Task.WhenAll(tasks);
        }
        catch (OperationCanceledException)
        {
            // expected on shutdown, or triggered by HeartbeatLoopAsync below after repeated
            // heartbeat rejections mid-run
        }
    }

    // The console derives online/offline from heartbeat recency (10-minute window), not from a
    // one-shot flag; a heartbeat sent only once at startup would make a perfectly healthy,
    // days-old agent look offline. This keeps it fresh well inside that window.
    private static async Task HeartbeatLoopAsync(ConsoleApiClient client, AgentConfig config, CancellationTokenSource cts)
    {
        var consecutiveFailures = 0;
        while (!cts.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(2), cts.Token);
                var result = await client.HeartbeatAsync("phase4-v1", cts.Token);
                if (result.Success)
                {
                    RefreshCreditCardPolicyIfChanged(config, result.DefaultCreditCardPolicyId);
                    consecutiveFailures = 0;
                    continue;
                }

                consecutiveFailures++;
                Console.Error.WriteLine($"[heartbeat] rejected by console ({consecutiveFailures} in a row).");
                if (consecutiveFailures >= 2)
                {
                    // Two in a row (~4 minutes) rules out a one-off blip; the console genuinely
                    // doesn't recognize us anymore. Clear the stale pairing and tear the whole
                    // channel loop down so the outer retry re-pairs from scratch, rather than
                    // quietly monitoring under dead credentials indefinitely.
                    Console.Error.WriteLine("[pairing] clearing stored credentials and restarting to re-register.");
                    AgentCredentialStore.Clear();
                    cts.Cancel();
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[heartbeat] failed: {ex.Message}");
            }
        }
    }

    public static async Task<List<IDetector>> LoadEdmDetectorsAsync(ConsoleApiClient client, AgentConfig config)
    {
        var detectors = new List<IDetector>();
        foreach (var binding in config.EdmDatasets)
        {
            if (string.IsNullOrWhiteSpace(binding.DatasetId) || string.IsNullOrWhiteSpace(binding.PolicyId))
                continue;

            var set = await client.GetEdmDetectionSetAsync(binding.DatasetId);
            if (set is null)
            {
                Console.Error.WriteLine($"[edm] failed to fetch dataset {binding.DatasetId}, skipping.");
                continue;
            }

            detectors.Add(new EdmDetector(set.Id, binding.PolicyId, set.FieldType, set.Salt, set.Hashes));
            Console.WriteLine($"[edm] loaded dataset '{set.Id}' ({set.Hashes.Count} values, field_type={set.FieldType}).");
        }
        return detectors;
    }

    public static async Task<List<FingerprintReference>> LoadFingerprintReferencesAsync(ConsoleApiClient client, AgentConfig config)
    {
        var references = new List<FingerprintReference>();
        foreach (var binding in config.FingerprintDatasets)
        {
            if (string.IsNullOrWhiteSpace(binding.DatasetId) || string.IsNullOrWhiteSpace(binding.PolicyId))
                continue;

            var set = await client.GetFingerprintDetectionSetAsync(binding.DatasetId);
            if (set is null)
            {
                Console.Error.WriteLine($"[fingerprint] failed to fetch dataset {binding.DatasetId}, skipping.");
                continue;
            }

            references.Add(new FingerprintReference(set.Id, binding.PolicyId, set.Name, set.CtphHash));
            Console.WriteLine($"[fingerprint] loaded reference '{set.Name}'.");
        }
        return references;
    }
}
