namespace CloakDlp.Agent.Detection;

public sealed record CreditCardMatch(string RawText, string Digits, int Index);
