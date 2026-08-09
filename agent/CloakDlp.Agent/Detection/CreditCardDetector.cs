using System.Text.RegularExpressions;

namespace CloakDlp.Agent.Detection;

// Phase 1 detector: regex finds digit-sequence candidates (allowing space/dash separators),
// then Luhn validation cuts false positives before anything is reported. Regex alone flags
// far too many incidental 13-19 digit numbers (order IDs, phone numbers, etc.) to be useful.
public static partial class CreditCardDetector
{
    [GeneratedRegex(@"\b(?:\d[ -]?){13,19}\b")]
    private static partial Regex CandidateRegex();

    public static IReadOnlyList<CreditCardMatch> Find(string content)
    {
        var matches = new List<CreditCardMatch>();

        foreach (Match m in CandidateRegex().Matches(content))
        {
            var digits = new string(m.Value.Where(char.IsDigit).ToArray());
            if (digits.Length is < 13 or > 19)
                continue;

            if (PassesLuhn(digits))
                matches.Add(new CreditCardMatch(m.Value, digits, m.Index));
        }

        return matches;
    }

    public static bool PassesLuhn(string digits)
    {
        var sum = 0;
        var alternate = false;

        for (var i = digits.Length - 1; i >= 0; i--)
        {
            var n = digits[i] - '0';
            if (alternate)
            {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alternate = !alternate;
        }

        return sum % 10 == 0;
    }
}
