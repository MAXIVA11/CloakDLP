namespace CloakDlp.Agent.Detection;

public sealed class DetectorPipeline
{
    private readonly IReadOnlyList<IDetector> _detectors;

    public DetectorPipeline(IEnumerable<IDetector>? additionalDetectors = null)
    {
        var detectors = new List<IDetector>
        {
            new CreditCardDetector(),
            new SsnDetector(),
            new ApiKeyDetector(),
            new PrivateKeyDetector(),
        };
        if (additionalDetectors is not null) detectors.AddRange(additionalDetectors);
        _detectors = detectors;
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
