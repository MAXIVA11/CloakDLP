namespace CloakDlp.Agent.Detection;

public interface IDetector
{
    // Matches app/models.py's DataType enum on the console.
    string DataType { get; }

    IReadOnlyList<DetectionMatch> Find(string content);
}
