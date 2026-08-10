namespace CloakDlp.Agent.Detection;

public sealed record FingerprintReference(string DatasetId, string PolicyId, string Name, string CtphHash);

// Not an IDetector — fingerprinting compares whole-document byte content against reference
// hashes rather than scanning text for patterns, so it operates on raw bytes, not a decoded
// string, and reports at most one match per reference per scan (a similarity score, not a
// count of pattern occurrences).
public sealed class FingerprintMatcher
{
    private readonly IReadOnlyList<FingerprintReference> _references;
    private readonly int _threshold;

    public FingerprintMatcher(IReadOnlyList<FingerprintReference> references, int threshold)
    {
        _references = references;
        _threshold = threshold;
    }

    public IReadOnlyList<DetectionMatch> Match(byte[] content)
    {
        if (_references.Count == 0 || content.Length == 0) return Array.Empty<DetectionMatch>();

        var localHash = Ctph.Hash(content);
        var matches = new List<DetectionMatch>();

        foreach (var reference in _references)
        {
            var score = Ctph.Similarity(localHash, reference.CtphHash);
            if (score < _threshold) continue;

            matches.Add(new DetectionMatch(
                "fingerprint_doc",
                $"fingerprint-{reference.DatasetId}",
                $"{score}% similar to '{reference.Name}'",
                score / 100.0,
                PolicyIdOverride: reference.PolicyId));
        }

        return matches;
    }
}
