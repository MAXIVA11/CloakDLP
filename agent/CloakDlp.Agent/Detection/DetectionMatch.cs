namespace CloakDlp.Agent.Detection;

public sealed record DetectionMatch(string DataType, string RuleId, string RedactedSnippet, double Confidence);
