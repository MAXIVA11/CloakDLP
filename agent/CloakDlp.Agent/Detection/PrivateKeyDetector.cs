using System.Text.RegularExpressions;

namespace CloakDlp.Agent.Detection;

// PEM headers are distinctive enough that this has essentially no false-positive rate — no
// secondary validation needed the way credit cards need Luhn or SSNs need range checks.
public sealed partial class PrivateKeyDetector : IDetector
{
    public string DataType => "private_key";

    [GeneratedRegex(@"-----BEGIN ((?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY)-----(.*?)-----END \1-----", RegexOptions.Singleline)]
    private static partial Regex PemBlockRegex();

    public IReadOnlyList<DetectionMatch> Find(string content)
    {
        var matches = new List<DetectionMatch>();

        foreach (Match m in PemBlockRegex().Matches(content))
        {
            var keyType = m.Groups[1].Value;
            var bodyLength = m.Groups[2].Value.Length;
            var maskLength = Math.Clamp(bodyLength / 20, 8, 48);
            var snippet = $"-----BEGIN {keyType}----- {new string('*', maskLength)} -----END {keyType}-----";
            matches.Add(new DetectionMatch(DataType, "pem-private-key-v1", snippet, 0.98));
        }

        return matches;
    }
}
