using CloakDlp.Agent.Channels;
using CloakDlp.Agent.Config;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using Microsoft.Extensions.Configuration;

namespace CloakDlp.Agent;

// Shared setup + channel-watching loop used by both the interactive `monitor` command and the
// Windows Service worker — the two have identical behavior, just different hosts/lifecycles.
public static class AgentRuntime
{
    public static AgentConfig LoadConfig()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: false)
            .AddEnvironmentVariables(prefix: "CLOAKDLP_")
            .Build();

        var config = new AgentConfig();
        configuration.Bind(config);
        return config;
    }

    public static async Task RunChannelsAsync(AgentConfig config, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(config.AgentId) || string.IsNullOrWhiteSpace(config.ApiKey))
        {
            Console.Error.WriteLine("Agent is not registered. Set AgentId/ApiKey in appsettings.json (obtained via console agent registration).");
            return;
        }

        using var client = new ConsoleApiClient(config);
        var reporter = new IncidentReporter(client, config.PolicyIdsByDataType);
        var pipeline = new DetectorPipeline(await LoadEdmDetectorsAsync(client, config));
        var fingerprintMatcher = new FingerprintMatcher(await LoadFingerprintReferencesAsync(client, config), config.FingerprintThreshold);
        await client.HeartbeatAsync("phase4-v1", ct);

        Console.WriteLine($"CloakDLP agent monitoring: clipboard, print, network (proxy on port {config.ProxyPort}).");

        var clipboard = new ClipboardMonitor(pipeline, reporter);
        var print = new PrintMonitor(pipeline, reporter);
        var proxy = new NetworkProxyMonitor(pipeline, reporter, config.ProxyPort, fingerprintMatcher);

        var tasks = new List<Task>
        {
            Task.Run(() => clipboard.Run(ct), ct),
            Task.Run(() => print.RunAsync(ct), ct),
            Task.Run(() => proxy.RunAsync(ct), ct),
        };

        try
        {
            await Task.WhenAll(tasks);
        }
        catch (OperationCanceledException)
        {
            // expected on shutdown
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
