using System.Net.Http.Json;
using CloakDlp.Agent.Config;
using CloakDlp.Agent.Models;

namespace CloakDlp.Agent.ConsoleApi;

public sealed class ConsoleApiClient : IDisposable
{
    private readonly HttpClient _http;

    public ConsoleApiClient(AgentConfig config)
    {
        _http = new HttpClient { BaseAddress = new Uri(config.ConsoleUrl) };
        _http.DefaultRequestHeaders.Add("X-Agent-Id", config.AgentId);
        _http.DefaultRequestHeaders.Add("X-Api-Key", config.ApiKey);
    }

    public async Task<bool> HeartbeatAsync(string policyVersion, CancellationToken ct = default)
    {
        var response = await _http.PostAsJsonAsync("/api/agents/heartbeat", new HeartbeatRequest { PolicyVersion = policyVersion }, ct);
        return response.IsSuccessStatusCode;
    }

    public async Task<HttpResponseMessage> ReportIncidentAsync(IncidentCreateRequest incident, CancellationToken ct = default)
    {
        return await _http.PostAsJsonAsync("/api/incidents", incident, ct);
    }

    public void Dispose() => _http.Dispose();
}
