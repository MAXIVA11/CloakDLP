namespace CloakDlp.Agent.Detection;

public static class Redactor
{
    // Keeps the last 4 digits only. This is the only representation of the match that ever
    // leaves the endpoint — the console never sees the full card number.
    public static string RedactDigits(string digits)
    {
        if (digits.Length <= 4)
            return new string('*', digits.Length);

        var last4 = digits[^4..];
        var maskedLength = digits.Length - 4;
        return string.Concat(Enumerable.Repeat("*", maskedLength)) + last4;
    }
}
