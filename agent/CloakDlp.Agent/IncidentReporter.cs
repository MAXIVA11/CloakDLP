using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using CloakDlp.Agent.Models;

namespace CloakDlp.Agent;

public sealed class IncidentReporter
{
    private readonly ConsoleApiClient _client;
    private readonly IReadOnlyDictionary<string, string> _policyIdsByDataType;

    public IncidentReporter(ConsoleApiClient client, IReadOnlyDictionary<string, string> policyIdsByDataType)
    {
        _client = client;
        _policyIdsByDataType = policyIdsByDataType;
    }

    public async Task<bool> ReportAsync(DetectionMatch match, string channel, string sourceIdentifier)
    {
        if (!_policyIdsByDataType.TryGetValue(match.DataType, out var policyId) || string.IsNullOrWhiteSpace(policyId))
        {
            Console.WriteLine($"  [skip] no policy configured for data_type={match.DataType}");
            return false;
        }

        var incident = new IncidentCreateRequest
        {
            PolicyId = policyId,
            Channel = channel,
            ActionTaken = "log",
            Confidence = match.Confidence,
            RedactedSnippet = match.RedactedSnippet,
            RuleId = match.RuleId,
            SourceIdentifier = sourceIdentifier,
        };

        var response = await _client.ReportIncidentAsync(incident);
        if (response.IsSuccessStatusCode)
        {
            Console.WriteLine($"  [{channel}] {match.DataType} match ({match.RuleId}) -> incident reported");
            return true;
        }

        var body = await response.Content.ReadAsStringAsync();
        Console.Error.WriteLine($"  Failed to report incident: {(int)response.StatusCode} {body}");
        return false;
    }
}
