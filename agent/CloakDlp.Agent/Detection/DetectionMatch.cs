namespace CloakDlp.Agent.Detection;

public sealed record DetectionMatch(
    string DataType,
    string RuleId,
    string RedactedSnippet,
    double Confidence,
    // Set by detectors (like EDM) that already know exactly which policy they belong to,
    // bypassing the generic data_type -> policy_id lookup in IncidentReporter.
    string? PolicyIdOverride = null);
