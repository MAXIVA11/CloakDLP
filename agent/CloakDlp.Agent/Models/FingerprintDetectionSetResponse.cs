using System.Text.Json.Serialization;

namespace CloakDlp.Agent.Models;

public sealed class FingerprintDetectionSetResponse
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("ctph_hash")]
    public required string CtphHash { get; init; }
}
