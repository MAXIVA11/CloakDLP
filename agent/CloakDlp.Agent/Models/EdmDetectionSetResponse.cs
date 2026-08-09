using System.Text.Json.Serialization;

namespace CloakDlp.Agent.Models;

public sealed class EdmDetectionSetResponse
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("field_type")]
    public required string FieldType { get; init; }

    [JsonPropertyName("salt")]
    public required string Salt { get; init; }

    [JsonPropertyName("hashes")]
    public required List<string> Hashes { get; init; }
}
