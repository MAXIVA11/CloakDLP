using System.Text;
using CloakDlp.Agent;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

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

if (args[0] == "service")
{
    ServiceLogging.RedirectToFile();
    var builder = Host.CreateApplicationBuilder(args);
    builder.Services.AddWindowsService(options => options.ServiceName = "CloakDLP Agent");
    builder.Services.AddHostedService<AgentWorker>();
    using var host = builder.Build();
    await host.RunAsync();
    return 0;
}

var config = await AgentRuntime.LoadConfigAsync();

if (string.IsNullOrWhiteSpace(config.AgentId) || string.IsNullOrWhiteSpace(config.ApiKey))
{
    Console.Error.WriteLine("Couldn't pair with a console. Is it running at " + config.ConsoleUrl + "?");
    return 1;
}

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

    using var client = new ConsoleApiClient(config);
    var reporter = new IncidentReporter(client, config.PolicyIdsByDataType);
    var pipeline = new DetectorPipeline(await AgentRuntime.LoadEdmDetectorsAsync(client, config));
    var fingerprintMatcher = new FingerprintMatcher(await AgentRuntime.LoadFingerprintReferencesAsync(client, config), config.FingerprintThreshold);
    await client.HeartbeatAsync("phase4-v1");

    var bytes = await File.ReadAllBytesAsync(filePath);
    var content = Encoding.UTF8.GetString(bytes);

    var matches = pipeline.Scan(content).Concat(fingerprintMatcher.Match(bytes)).ToList();
    Console.WriteLine($"Scanned {filePath}: {matches.Count} match(es).");

    var reported = 0;
    var fullPath = Path.GetFullPath(filePath);
    foreach (var match in matches)
    {
        if ((await reporter.ReportAsync(match, "file", fullPath)).Reported)
            reported++;
    }

    Console.WriteLine($"Reported {reported}/{matches.Count} incident(s) to {config.ConsoleUrl}.");
    return 0;
}

async Task<int> RunMonitorAsync()
{
    Console.WriteLine("Press Ctrl+C to stop.");

    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
        e.Cancel = true;
        cts.Cancel();
    };

    await AgentRuntime.RunChannelsAsync(config, cts.Token);
    return 0;
}

void PrintUsage()
{
    Console.WriteLine("Usage:");
    Console.WriteLine("  CloakDlp.Agent scan <file-path>   One-shot file-channel scan.");
    Console.WriteLine("  CloakDlp.Agent monitor            Watch clipboard, print, and network channels (interactive).");
    Console.WriteLine("  CloakDlp.Agent service             Run the same channels under the Windows Service Control Manager.");
    Console.WriteLine("  CloakDlp.Agent hash <file-path>    Print a file's CTPH fingerprint (no console connection needed).");
}
