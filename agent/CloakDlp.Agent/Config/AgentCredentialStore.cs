using System.Text.Json;

namespace CloakDlp.Agent.Config;

// Persists the AgentId/ApiKey issued by self-registration so the agent only has to pair with
// the console once, even across service restarts — appsettings.json stays untouched (it lives
// under Program Files, not reliably writable at runtime without elevation anyway).
public static class AgentCredentialStore
{
    private static string StorePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "CloakDLP", "agent_credentials.json");

    public static (string AgentId, string ApiKey)? Load()
    {
        if (!File.Exists(StorePath)) return null;
        try
        {
            var doc = JsonSerializer.Deserialize<StoredCredentials>(File.ReadAllText(StorePath));
            if (doc is null || string.IsNullOrWhiteSpace(doc.AgentId) || string.IsNullOrWhiteSpace(doc.ApiKey))
                return null;
            return (doc.AgentId, doc.ApiKey);
        }
        catch
        {
            return null;
        }
    }

    public static void Save(string agentId, string apiKey)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StorePath)!);
        File.WriteAllText(StorePath, JsonSerializer.Serialize(new StoredCredentials { AgentId = agentId, ApiKey = apiKey }));
    }

    private sealed class StoredCredentials
    {
        public string AgentId { get; set; } = "";
        public string ApiKey { get; set; } = "";
    }
}
