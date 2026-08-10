using System.Text;

namespace CloakDlp.Agent.Detection;

// Context-Triggered Piecewise Hashing (CTPH) — a from-scratch fuzzy hash, algorithmically in
// the spirit of ssdeep/TLSH but not binary-compatible with either. Small edits only perturb the
// signature characters near the edit, so similarity between two hashes degrades gracefully
// instead of falling off a cliff the way a cryptographic hash's would.
//
// This exact spec (window size, trigger rule, alphabet, block-size formula) is reimplemented in
// the console backend (console-backend/app/ctph.py) — the two MUST stay in lockstep, or a hash
// produced by one side is meaningless to the other. See ARCHITECTURE.md.
public static class Ctph
{
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    private const int Window = 7;
    private const int MinBlockSize = 3;
    private const int TargetSigLength = 64;
    private const uint FnvOffsetBasis = 0x811C9DC5;
    private const uint FnvPrime = 0x01000193;

    public static string Hash(byte[] data)
    {
        if (data.Length == 0) return $"{MinBlockSize}::";

        var b = SelectBlockSize(data.Length);
        return $"{b}:{Signature(data, b)}:{Signature(data, b * 2)}";
    }

    // 0-100. Only comparable when block sizes match or one is exactly double the other —
    // mirrors ssdeep's own approach of generating two block-size signatures per hash so
    // similarly-sized-but-not-identical documents still have a common ground to compare on.
    public static int Similarity(string hashA, string hashB)
    {
        var (blockA, sigBA, sig2BA) = Parse(hashA);
        var (blockB, sigBB, sig2BB) = Parse(hashB);

        if (blockA == blockB) return EditSimilarity(sigBA, sigBB);
        if (blockA == blockB * 2) return EditSimilarity(sigBA, sig2BB);
        if (blockB == blockA * 2) return EditSimilarity(sig2BA, sigBB);
        return 0;
    }

    private static (int block, string sigB, string sig2B) Parse(string hash)
    {
        var parts = hash.Split(':');
        return (int.Parse(parts[0]), parts.Length > 1 ? parts[1] : "", parts.Length > 2 ? parts[2] : "");
    }

    private static uint Fnv1aStep(uint h, byte b) => unchecked((h ^ b) * FnvPrime);

    private static uint WindowHash(ReadOnlySpan<byte> window)
    {
        var h = FnvOffsetBasis;
        foreach (var b in window) h = Fnv1aStep(h, b);
        return h;
    }

    private static int SelectBlockSize(int length)
    {
        var b = MinBlockSize;
        while ((double)length / b > TargetSigLength) b *= 2;
        return b;
    }

    private static string Signature(byte[] data, int blockSize)
    {
        var sb = new StringBuilder();
        var piece = FnvOffsetBasis;
        var window = new byte[Window];
        var windowLen = 0;

        foreach (var b in data)
        {
            piece = Fnv1aStep(piece, b);

            if (windowLen < Window)
            {
                window[windowLen++] = b;
            }
            else
            {
                Array.Copy(window, 1, window, 0, Window - 1);
                window[Window - 1] = b;
            }

            if (windowLen == Window)
            {
                var h = WindowHash(window);
                if (h % blockSize == blockSize - 1)
                {
                    sb.Append(Alphabet[(int)(piece % 64)]);
                    piece = FnvOffsetBasis;
                }
            }
        }

        if (piece != FnvOffsetBasis || sb.Length == 0)
            sb.Append(Alphabet[(int)(piece % 64)]);

        return sb.ToString();
    }

    private static int EditSimilarity(string a, string b)
    {
        if (a.Length == 0 && b.Length == 0) return 100;
        var distance = LevenshteinDistance(a, b);
        var maxLen = Math.Max(a.Length, b.Length);
        return maxLen == 0 ? 100 : (int)Math.Round(100.0 * (1.0 - (double)distance / maxLen));
    }

    private static int LevenshteinDistance(string a, string b)
    {
        var dp = new int[a.Length + 1, b.Length + 1];
        for (var i = 0; i <= a.Length; i++) dp[i, 0] = i;
        for (var j = 0; j <= b.Length; j++) dp[0, j] = j;

        for (var i = 1; i <= a.Length; i++)
        {
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                dp[i, j] = Math.Min(Math.Min(dp[i - 1, j] + 1, dp[i, j - 1] + 1), dp[i - 1, j - 1] + cost);
            }
        }

        return dp[a.Length, b.Length];
    }
}
