using System.Text;

namespace CloakDlp.Agent.Channels;

// Minimal HTTP/1.1 request-line + headers + Content-Length-body parser, just enough for the
// forward proxy. Not a general-purpose HTTP parser (no chunked encoding, no header folding).
internal sealed class HttpMessage
{
    public required string Method { get; init; }
    public required string Target { get; init; }
    public required Dictionary<string, string> Headers { get; init; }
    public required byte[] Body { get; init; }

    public static async Task<HttpMessage?> ReadRequestAsync(Stream stream, CancellationToken ct)
    {
        var headerBytes = await ReadUntilHeadersEndAsync(stream, ct);
        if (headerBytes is null) return null;

        var headerText = Encoding.ASCII.GetString(headerBytes);
        var lines = headerText.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length == 0) return null;

        var requestLineParts = lines[0].Split(' ', 3);
        if (requestLineParts.Length < 2) return null;

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 1; i < lines.Length; i++)
        {
            var idx = lines[i].IndexOf(':');
            if (idx <= 0) continue;
            var name = lines[i][..idx].Trim().ToLowerInvariant();
            var value = lines[i][(idx + 1)..].Trim();
            headers[name] = value;
        }

        var body = Array.Empty<byte>();
        if (headers.TryGetValue("content-length", out var lenStr) && int.TryParse(lenStr, out var len) && len > 0)
        {
            body = new byte[len];
            var read = 0;
            while (read < len)
            {
                var n = await stream.ReadAsync(body.AsMemory(read, len - read), ct);
                if (n == 0) break;
                read += n;
            }
        }

        return new HttpMessage
        {
            Method = requestLineParts[0],
            Target = requestLineParts[1],
            Headers = headers,
            Body = body,
        };
    }

    private static async Task<byte[]?> ReadUntilHeadersEndAsync(Stream stream, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        var buffer = new byte[1];
        var sawSequence = 0; // tracks progress through \r\n\r\n

        while (true)
        {
            var n = await stream.ReadAsync(buffer.AsMemory(0, 1), ct);
            if (n == 0) return ms.Length == 0 ? null : ms.ToArray();

            ms.WriteByte(buffer[0]);
            sawSequence = buffer[0] switch
            {
                (byte)'\r' when sawSequence is 0 or 2 => sawSequence + 1,
                (byte)'\n' when sawSequence is 1 or 3 => sawSequence + 1,
                _ => 0,
            };

            if (sawSequence == 4) return ms.ToArray();
            if (ms.Length > 64 * 1024) return ms.ToArray(); // header size guard
        }
    }
}
