using CloakDlp.Agent.Config;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using CloakDlp.Agent.Models;
using Microsoft.Extensions.Configuration;

if (args.Length < 2 || args[0] != "scan")
{
    Console.WriteLine("Usage: CloakDlp.Agent scan <file-path> [--enforce]");
    Console.WriteLine("  Phase 1: file-channel regex+Luhn credit card detection.");
    Console.WriteLine("  Default is simulate mode (log only). --enforce reports action=flag.");
    return 1;
}

var filePath = args[1];
var enforce = args.Contains("--enforce");

if (!File.Exists(filePath))
{
    Console.Error.WriteLine($"File not found: {filePath}");
    return 1;
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

if (string.IsNullOrWhiteSpace(config.CreditCardPolicyId))
{
    Console.Error.WriteLine("No CreditCardPolicyId configured in appsettings.json.");
    return 1;
}

var content = await File.ReadAllTextAsync(filePath);
var matches = CreditCardDetector.Find(content);

Console.WriteLine($"Scanned {filePath}: {matches.Count} candidate match(es) passed Luhn validation.");

if (matches.Count == 0)
    return 0;

using var client = new ConsoleApiClient(config);
await client.HeartbeatAsync(policyVersion: "phase1-v1");

var action = enforce ? "flag" : "log";
var reported = 0;

foreach (var match in matches)
{
    var redacted = Redactor.RedactDigits(match.Digits);
    var incident = new IncidentCreateRequest
    {
        PolicyId = config.CreditCardPolicyId,
        Channel = "file",
        ActionTaken = action,
        Confidence = 0.95,
        RedactedSnippet = redacted,
        RuleId = "credit-card-regex-luhn-v1",
        SourceIdentifier = Path.GetFullPath(filePath),
    };

    var response = await client.ReportIncidentAsync(incident);
    if (response.IsSuccessStatusCode)
    {
        reported++;
        Console.WriteLine($"  [{action}] match ending in {redacted[^4..]} -> incident reported");
    }
    else
    {
        var body = await response.Content.ReadAsStringAsync();
        Console.Error.WriteLine($"  Failed to report incident: {(int)response.StatusCode} {body}");
    }
}

Console.WriteLine($"Reported {reported}/{matches.Count} incident(s) to {config.ConsoleUrl}.");
return 0;
