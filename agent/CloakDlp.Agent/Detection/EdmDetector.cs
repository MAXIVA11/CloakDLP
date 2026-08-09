using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace CloakDlp.Agent.Detection;

// Exact Data Match: candidate tokens are extracted locally, normalized and salted-hashed the
// same way the console hashed the reference dataset, then checked against the fetched hash set.
// The raw reference values never left the console, and the raw candidate values never leave
// this process either — only the redacted snippet does, same as every other detector.
public sealed partial class EdmDetector : IDetector
{
    public string DataType => "edm_dataset";

    private readonly string _datasetId;
    private readonly string _policyId;
    private readonly string _fieldType;
    private readonly string _salt;
    private readonly HashSet<string> _hashes;

    public EdmDetector(string datasetId, string policyId, string fieldType, string salt, IEnumerable<string> hashes)
    {
        _datasetId = datasetId;
        _policyId = policyId;
        _fieldType = fieldType;
        _salt = salt;
        _hashes = new HashSet<string>(hashes);
    }

    [GeneratedRegex(@"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"\b(?:\d[ -]?){6,32}\b")]
    private static partial Regex NumberRegex();

    public IReadOnlyList<DetectionMatch> Find(string content)
    {
        var matches = new List<DetectionMatch>();
        var candidates = _fieldType == "email"
            ? EmailRegex().Matches(content).Select(m => m.Value)
            : NumberRegex().Matches(content).Select(m => m.Value);

        foreach (var candidate in candidates)
        {
            var normalized = Normalize(candidate);
            if (normalized.Length == 0) continue;

            var hash = HashValue(_salt, normalized);
            if (!_hashes.Contains(hash)) continue;

            matches.Add(new DetectionMatch(
                DataType,
                $"edm-{_datasetId}",
                Redactor.RedactKeepLast4(candidate),
                0.9,
                PolicyIdOverride: _policyId));
        }

        return matches;
    }

    private string Normalize(string value) =>
        _fieldType == "email" ? value.Trim().ToLowerInvariant() : new string(value.Where(char.IsDigit).ToArray());

    private static string HashValue(string salt, string normalized)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(salt + normalized));
        return Convert.ToHexStringLower(bytes);
    }
}
