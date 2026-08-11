namespace CloakDlp.Agent.Detection;

public static class Redactor
{
    // Keeps the last 4 characters only. This is the only representation of a match that ever
    // leaves the endpoint; the console never sees the raw value.
    public static string RedactKeepLast4(string value)
    {
        if (value.Length <= 4)
            return new string('*', value.Length);

        var last4 = value[^4..];
        var maskedLength = value.Length - 4;
        return string.Concat(Enumerable.Repeat("*", maskedLength)) + last4;
    }
}
