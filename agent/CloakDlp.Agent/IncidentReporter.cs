using System.Net.Http.Json;
using System.Text.Json.Serialization;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;
using CloakDlp.Agent.Models;

namespace CloakDlp.Agent;

// Reported is whether the incident was successfully recorded; Blocked is the console's
// authoritative answer to "should the channel actually stop this" - the policy's real action
// and simulate_mode live server-side, not in anything a channel has cached, so this is always
// asked fresh rather than assumed. Fails closed on the "was it reported" question (a failed
// report returns Reported=false) but open on blocking (any failure - network error, console
// down - returns Blocked=false, matching the "best-effort, log only" posture everywhere else
// in this project rather than risking silently breaking someone's clipboard/printing/browsing
// because the console happened to be unreachable).
public sealed record IncidentReportResult(bool Reported, bool Blocked);

public sealed class IncidentReporter
{
    private readonly ConsoleApiClient _client;
    private readonly IReadOnlyDictionary<string, string> _policyIdsByDataType;

    public IncidentReporter(ConsoleApiClient client, IReadOnlyDictionary<string, string> policyIdsByDataType)
    {
        _client = client;
        _policyIdsByDataType = policyIdsByDataType;
    }

    public async Task<IncidentReportResult> ReportAsync(DetectionMatch match, string channel, string sourceIdentifier)
    {
        var policyId = match.PolicyIdOverride;
        if (string.IsNullOrWhiteSpace(policyId) &&
            (!_policyIdsByDataType.TryGetValue(match.DataType, out policyId) || string.IsNullOrWhiteSpace(policyId)))
        {
            Console.WriteLine($"  [skip] no policy configured for data_type={match.DataType}");
            return new IncidentReportResult(false, false);
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
            var body = await response.Content.ReadFromJsonAsync<IncidentCreateResponse>();
            var blocked = body?.Blocked ?? false;
            Console.WriteLine($"  [{channel}] {match.DataType} match ({match.RuleId}) -> incident reported{(blocked ? " (BLOCKED)" : "")}");
            return new IncidentReportResult(true, blocked);
        }

        var errorBody = await response.Content.ReadAsStringAsync();
        Console.Error.WriteLine($"  Failed to report incident: {(int)response.StatusCode} {errorBody}");
        return new IncidentReportResult(false, false);
    }

    private sealed class IncidentCreateResponse
    {
        [JsonPropertyName("blocked")]
        public bool Blocked { get; set; }
    }
}
