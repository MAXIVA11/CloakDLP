namespace CloakDlp.Agent.Config;

public sealed class AgentConfig
{
    public string ConsoleUrl { get; set; } = "http://127.0.0.1:8123";
    public string AgentId { get; set; } = "";
    public string ApiKey { get; set; } = "";

    // data_type -> policy_id. Populated from the console's policy list (Agents page issues the
    // agent an API key; the operator copies each relevant policy's id in here per data type).
    public Dictionary<string, string> PolicyIdsByDataType { get; set; } = new();

    // Local port the network-egress proxy listens on. Point a browser's proxy settings at it.
    public int ProxyPort { get; set; } = 8888;

    // EDM datasets to check against, each tied to the policy that governs matches against it.
    public List<DatasetBinding> EdmDatasets { get; set; } = new();

    // Document fingerprints to check against, each tied to the policy that governs matches.
    public List<DatasetBinding> FingerprintDatasets { get; set; } = new();

    // Minimum CTPH similarity (0-100) to report a fingerprint match.
    public int FingerprintThreshold { get; set; } = 40;
}

public sealed class DatasetBinding
{
    public string DatasetId { get; set; } = "";
    public string PolicyId { get; set; } = "";
}
