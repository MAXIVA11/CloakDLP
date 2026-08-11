using System.Text.RegularExpressions;

namespace CloakDlp.Agent.Detection;

// Only matches the dashed AAA-GG-SSSS form. Bare 9-digit runs are indistinguishable from any
// other 9-digit number and would make this detector useless on their own; a deliberate v1
// scope decision, not an oversight.
public sealed partial class SsnDetector : IDetector
{
    public string DataType => "ssn";

    [GeneratedRegex(@"\b(\d{3})-(\d{2})-(\d{4})\b")]
    private static partial Regex CandidateRegex();

    public IReadOnlyList<DetectionMatch> Find(string content)
    {
        var matches = new List<DetectionMatch>();

        foreach (Match m in CandidateRegex().Matches(content))
        {
            var area = m.Groups[1].Value;
            var group = m.Groups[2].Value;
            var serial = m.Groups[3].Value;

            if (IsPlausible(area, group, serial))
            {
                var digits = area + group + serial;
                matches.Add(new DetectionMatch(DataType, "ssn-regex-v1", Redactor.RedactKeepLast4(digits), 0.85));
            }
        }

        return matches;
    }

    private static bool IsPlausible(string area, string group, string serial)
    {
        if (area is "000" or "666") return false;
        if (int.Parse(area) >= 900) return false;
        if (group == "00") return false;
        if (serial == "0000") return false;
        return true;
    }
}
