namespace CloakDlp.Agent.Detection;

public sealed class DetectorPipeline
{
    private readonly IReadOnlyList<IDetector> _detectors;

    public DetectorPipeline(IEnumerable<IDetector>? detectors = null)
    {
        _detectors = detectors?.ToList() ?? new List<IDetector>
        {
            new CreditCardDetector(),
            new SsnDetector(),
            new ApiKeyDetector(),
            new PrivateKeyDetector(),
        };
    }

    public IReadOnlyList<DetectionMatch> Scan(string content)
    {
        var results = new List<DetectionMatch>();
        foreach (var detector in _detectors)
        {
            results.AddRange(detector.Find(content));
        }
        return results;
    }
}
