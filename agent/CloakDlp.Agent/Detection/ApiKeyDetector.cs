using System.Text.RegularExpressions;

namespace CloakDlp.Agent.Detection;

// Covers a handful of well-known token formats plus a generic "name = long-random-value"
// fallback for anything that looks like a secret assignment in code or config.
public sealed partial class ApiKeyDetector : IDetector
{
    public string DataType => "api_key";

    private sealed record Pattern(string RuleId, Regex Regex, double Confidence);

    [GeneratedRegex(@"\bAKIA[0-9A-Z]{16}\b")]
    private static partial Regex AwsAccessKeyRegex();

    [GeneratedRegex(@"\bgh[pousr]_[A-Za-z0-9]{36}\b")]
    private static partial Regex GitHubTokenRegex();

    [GeneratedRegex(@"\bxox[baprs]-[0-9A-Za-z-]{10,72}\b")]
    private static partial Regex SlackTokenRegex();

    [GeneratedRegex(@"(?i)\b(api[_-]?key|apikey|secret|token)\b\s*[:=]\s*['""]?([A-Za-z0-9_\-]{20,})['""]?")]
    private static partial Regex GenericAssignmentRegex();

    private static IReadOnlyList<Pattern> Patterns { get; } = new List<Pattern>
    {
        new("aws-access-key-id-v1", AwsAccessKeyRegex(), 0.9),
        new("github-token-v1", GitHubTokenRegex(), 0.92),
        new("slack-token-v1", SlackTokenRegex(), 0.9),
        new("generic-secret-assignment-v1", GenericAssignmentRegex(), 0.6),
    };

    public IReadOnlyList<DetectionMatch> Find(string content)
    {
        var matches = new List<DetectionMatch>();

        foreach (var pattern in Patterns)
        {
            foreach (Match m in pattern.Regex.Matches(content))
            {
                var value = m.Groups.Count > 2 && m.Groups[2].Success ? m.Groups[2].Value : m.Value;
                if (value.Length < 8) continue;
                matches.Add(new DetectionMatch(DataType, pattern.RuleId, Redactor.RedactKeepLast4(value), pattern.Confidence));
            }
        }

        return matches;
    }
}
