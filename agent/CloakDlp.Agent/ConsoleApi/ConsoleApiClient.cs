using System.Net.Http.Json;
using System.Text.Json.Serialization;
using CloakDlp.Agent.Config;
using CloakDlp.Agent.Models;

namespace CloakDlp.Agent.ConsoleApi;

// Success is whether the heartbeat itself was accepted; DefaultCreditCardPolicyId is the
// console's current answer to "what policy governs credit-card matches right now" - carried on
// every heartbeat response (not just self-register's) so a paired client can notice that answer
// changed without ever re-registering. Null when the heartbeat itself failed, distinct from a
// successful heartbeat where the console genuinely has no enabled credit-card policy right now.
public sealed record HeartbeatResult(bool Success, string? DefaultCreditCardPolicyId);

public sealed class ConsoleApiClient : IDisposable
{
    private readonly HttpClient _http;

    public ConsoleApiClient(AgentConfig config)
    {
        _http = new HttpClient { BaseAddress = new Uri(config.ConsoleUrl) };
        _http.DefaultRequestHeaders.Add("X-Agent-Id", config.AgentId);
        _http.DefaultRequestHeaders.Add("X-Api-Key", config.ApiKey);
    }

    public async Task<HeartbeatResult> HeartbeatAsync(string policyVersion, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/agents/heartbeat", new HeartbeatRequest { PolicyVersion = policyVersion }, ct);
        if (!response.IsSuccessStatusCode) return new HeartbeatResult(false, null);
        var body = await response.Content.ReadFromJsonAsync<HeartbeatResponse>(cancellationToken: ct);
        return new HeartbeatResult(true, body?.DefaultCreditCardPolicyId);
    }

    private sealed class HeartbeatResponse
    {
        [JsonPropertyName("default_credit_card_policy_id")]
        public string? DefaultCreditCardPolicyId { get; set; }
    }

    public async Task<HttpResponseMessage> ReportIncidentAsync(IncidentCreateRequest incident, CancellationToken ct = default)
    {
        return await _http.PostAsJsonAsync("/api/incidents", incident, ct);
    }

    public async Task<EdmDetectionSetResponse?> GetEdmDetectionSetAsync(string datasetId, CancellationToken ct = default)
    {
        var response = await _http.GetAsync($"/api/edm/datasets/{datasetId}/detection-set", ct);
        if (!response.IsSuccessStatusCode) return null;
        return await response.Content.ReadFromJsonAsync<EdmDetectionSetResponse>(cancellationToken: ct);
    }

    public async Task<FingerprintDetectionSetResponse?> GetFingerprintDetectionSetAsync(string datasetId, CancellationToken ct = default)
    {
        var response = await _http.GetAsync($"/api/fingerprints/{datasetId}/detection-set", ct);
        if (!response.IsSuccessStatusCode) return null;
        return await response.Content.ReadFromJsonAsync<FingerprintDetectionSetResponse>(cancellationToken: ct);
    }

    public void Dispose() => _http.Dispose();
}
