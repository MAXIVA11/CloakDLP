using System.Text.Json;

namespace CloakDlp.Agent.Config;

// Persists the AgentId/ApiKey/DefaultCreditCardPolicyId issued by self-registration so the
// agent only has to pair with the console once, even across service restarts; appsettings.json
// stays untouched (it lives under Program Files, not reliably writable at runtime without
// elevation anyway). Also read directly by CloakDlp.Tray, which reuses this same identity to
// report clipboard-detected incidents rather than self-registering a second one.
public static class AgentCredentialStore
{
    private static string StorePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "CloakDLP", "agent_credentials.json");

    public static (string AgentId, string ApiKey, string? DefaultCreditCardPolicyId)? Load()
    {
        if (!File.Exists(StorePath)) return null;
        try
        {
            var doc = JsonSerializer.Deserialize<StoredCredentials>(File.ReadAllText(StorePath));
            if (doc is null || string.IsNullOrWhiteSpace(doc.AgentId) || string.IsNullOrWhiteSpace(doc.ApiKey))
                return null;
            return (doc.AgentId, doc.ApiKey, doc.DefaultCreditCardPolicyId);
        }
        catch
        {
            return null;
        }
    }

    public static void Save(string agentId, string apiKey, string? defaultCreditCardPolicyId)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StorePath)!);
        File.WriteAllText(StorePath, JsonSerializer.Serialize(new StoredCredentials
        {
            AgentId = agentId,
            ApiKey = apiKey,
            DefaultCreditCardPolicyId = defaultCreditCardPolicyId,
        }));
    }

    // Called when the console stops recognizing these credentials (e.g. its database was reset
    // or the agent record was deleted); forces a fresh self-registration on the next pairing
    // attempt instead of retrying the same dead credentials forever.
    public static void Clear()
    {
        try
        {
            if (File.Exists(StorePath)) File.Delete(StorePath);
        }
        catch
        {
            // best-effort; worst case the next attempt still finds the stale file and fails again
        }
    }

    private sealed class StoredCredentials
    {
        public string AgentId { get; set; } = "";
        public string ApiKey { get; set; } = "";
        public string? DefaultCreditCardPolicyId { get; set; }
    }
}
