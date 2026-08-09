using System.Text.Json.Serialization;

namespace CloakDlp.Agent.Models;

public sealed class IncidentCreateRequest
{
    [JsonPropertyName("policy_id")]
    public required string PolicyId { get; init; }

    [JsonPropertyName("channel")]
    public required string Channel { get; init; }

    [JsonPropertyName("action_taken")]
    public required string ActionTaken { get; init; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; init; } = 1.0;

    [JsonPropertyName("redacted_snippet")]
    public required string RedactedSnippet { get; init; }

    [JsonPropertyName("rule_id")]
    public required string RuleId { get; init; }

    [JsonPropertyName("source_identifier")]
    public string SourceIdentifier { get; init; } = "";

    [JsonPropertyName("extra")]
    public Dictionary<string, object> Extra { get; init; } = new();
}
