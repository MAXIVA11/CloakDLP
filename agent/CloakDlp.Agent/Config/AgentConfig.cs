namespace CloakDlp.Agent.Config;

public sealed class AgentConfig
{
    public string ConsoleUrl { get; set; } = "http://127.0.0.1:8123";
    public string AgentId { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string CreditCardPolicyId { get; set; } = "";
}
