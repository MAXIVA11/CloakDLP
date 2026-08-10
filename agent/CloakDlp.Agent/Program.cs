using System.Text;
using CloakDlp.Agent;
using CloakDlp.Agent.Channels;
using CloakDlp.Agent.Config;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using Microsoft.Extensions.Configuration;

if (args.Length == 0)
{
    PrintUsage();
    return 1;
}

if (args[0] == "hash" && args.Length >= 2)
{
    var bytes = await File.ReadAllBytesAsync(args[1]);
    Console.WriteLine(Ctph.Hash(bytes));
    return 0;
}

var configuration = new ConfigurationBuilder()
    .SetBasePath(AppContext.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false)
    .AddEnvironmentVariables(prefix: "CLOAKDLP_")
    .Build();

var config = new AgentConfig();
configuration.Bind(config);

if (string.IsNullOrWhiteSpace(config.AgentId) || string.IsNullOrWhiteSpace(config.ApiKey))
{
    Console.Error.WriteLine("Agent is not registered. Set AgentId/ApiKey in appsettings.json (obtained via console agent registration).");
    return 1;
}

using var client = new ConsoleApiClient(config);
var reporter = new IncidentReporter(client, config.PolicyIdsByDataType);
var pipeline = new DetectorPipeline(await LoadEdmDetectorsAsync());
var fingerprintMatcher = new FingerprintMatcher(await LoadFingerprintReferencesAsync(), config.FingerprintThreshold);
await client.HeartbeatAsync(policyVersion: "phase4-v1");

switch (args[0])
{
    case "scan" when args.Length >= 2:
        return await RunScanAsync(args[1]);

    case "monitor":
        return await RunMonitorAsync();

    default:
        PrintUsage();
        return 1;
}

async Task<int> RunScanAsync(string filePath)
{
    if (!File.Exists(filePath))
    {
        Console.Error.WriteLine($"File not found: {filePath}");
        return 1;
    }

    var bytes = await File.ReadAllBytesAsync(filePath);
    var content = Encoding.UTF8.GetString(bytes);

    var matches = pipeline.Scan(content).Concat(fingerprintMatcher.Match(bytes)).ToList();
    Console.WriteLine($"Scanned {filePath}: {matches.Count} match(es).");

    var reported = 0;
    var fullPath = Path.GetFullPath(filePath);
    foreach (var match in matches)
    {
        if (await reporter.ReportAsync(match, "file", fullPath))
            reported++;
    }

    Console.WriteLine($"Reported {reported}/{matches.Count} incident(s) to {config.ConsoleUrl}.");
    return 0;
}

async Task<int> RunMonitorAsync()
{
    Console.WriteLine("CloakDLP agent monitoring: clipboard, print, network (proxy on port " + config.ProxyPort + ").");
    Console.WriteLine("Press Ctrl+C to stop.");

    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
        e.Cancel = true;
        cts.Cancel();
    };

    var clipboard = new ClipboardMonitor(pipeline, reporter);
    var print = new PrintMonitor(pipeline, reporter);
    var proxy = new NetworkProxyMonitor(pipeline, reporter, config.ProxyPort, fingerprintMatcher);

    var tasks = new List<Task>
    {
        Task.Run(() => clipboard.Run(cts.Token), cts.Token),
        Task.Run(() => print.RunAsync(cts.Token), cts.Token),
        Task.Run(() => proxy.RunAsync(cts.Token), cts.Token),
    };

    try
    {
        await Task.WhenAll(tasks);
    }
    catch (OperationCanceledException)
    {
        // expected on Ctrl+C
    }

    return 0;
}

async Task<List<IDetector>> LoadEdmDetectorsAsync()
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

async Task<List<FingerprintReference>> LoadFingerprintReferencesAsync()
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

void PrintUsage()
{
    Console.WriteLine("Usage:");
    Console.WriteLine("  CloakDlp.Agent scan <file-path>   One-shot file-channel scan.");
    Console.WriteLine("  CloakDlp.Agent monitor            Watch clipboard, print, and network channels.");
    Console.WriteLine("  CloakDlp.Agent hash <file-path>   Print a file's CTPH fingerprint (no console connection needed).");
}
