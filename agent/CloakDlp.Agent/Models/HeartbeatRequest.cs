using System.Text.Json.Serialization;

namespace CloakDlp.Agent.Models;

public sealed class HeartbeatRequest
{
    [JsonPropertyName("policy_version")]
    public string PolicyVersion { get; init; } = "";
}
