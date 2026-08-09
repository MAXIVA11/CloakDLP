using System.Net;
using System.Net.Sockets;
using System.Text;
using CloakDlp.Agent.Detection;

namespace CloakDlp.Agent.Channels;

// A plain-HTTP forward proxy (point a browser's proxy settings at 127.0.0.1:<port>). Built on
// raw TcpListener rather than HttpListener: HttpListener resolves Request.Url against its own
// registered prefix, not the absolute-URI a proxy client actually requests, which makes it
// silently loop a request back on itself instead of forwarding it — not usable for a real
// forward proxy. Buffers each request body, scans it, then forwards it unchanged — Phase 2 is
// detect/log only, never blocks.
//
// Scope notes:
//  - HTTP only. HTTPS interception needs a local CA installed into the OS/browser trust store
//    to MITM TLS — a much larger, more invasive follow-up deliberately left out of this phase.
//    CONNECT requests (how browsers tunnel HTTPS through a proxy) are rejected with 501.
//  - Content-Length bodies only; chunked transfer-encoding requests are forwarded unscanned.
//  - One request per connection (Connection: close on both legs) — no keep-alive.
public sealed class NetworkProxyMonitor
{
    private readonly DetectorPipeline _pipeline;
    private readonly IncidentReporter _reporter;
    private readonly int _port;

    private static readonly string[] ScannableContentTypes =
    {
        "text/", "application/json", "application/x-www-form-urlencoded", "multipart/form-data",
    };

    public NetworkProxyMonitor(DetectorPipeline pipeline, IncidentReporter reporter, int port)
    {
        _pipeline = pipeline;
        _reporter = reporter;
        _port = port;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        var listener = new TcpListener(IPAddress.Loopback, _port);
        try
        {
            listener.Start();
        }
        catch (SocketException ex)
        {
            Console.Error.WriteLine($"[network] failed to start proxy on port {_port}: {ex.Message}");
            return;
        }

        Console.WriteLine($"[network] HTTP proxy listening on 127.0.0.1:{_port} (point a browser's proxy settings here).");
        using var registration = ct.Register(listener.Stop);

        try
        {
            while (!ct.IsCancellationRequested)
            {
                TcpClient client;
                try
                {
                    client = await listener.AcceptTcpClientAsync(ct);
                }
                catch (Exception) when (ct.IsCancellationRequested)
                {
                    break;
                }

                _ = HandleConnectionAsync(client, ct);
            }
        }
        finally
        {
            listener.Stop();
        }
    }

    private async Task HandleConnectionAsync(TcpClient client, CancellationToken ct)
    {
        using var _ = client;
        try
        {
            using var stream = client.GetStream();
            var request = await HttpMessage.ReadRequestAsync(stream, ct);
            if (request is null) return;

            if (request.Method.Equals("CONNECT", StringComparison.OrdinalIgnoreCase))
            {
                await WriteRawAsync(stream, "HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\nHTTPS interception is not supported in this phase.", ct);
                return;
            }

            if (!Uri.TryCreate(request.Target, UriKind.Absolute, out var targetUri))
            {
                await WriteRawAsync(stream, "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nExpected an absolute-URI proxy request.", ct);
                return;
            }

            if (request.Body.Length > 0 && IsScannable(request.Headers.GetValueOrDefault("content-type")))
            {
                var text = Encoding.UTF8.GetString(request.Body);
                var matches = _pipeline.Scan(text);
                var sourceIdentifier = targetUri.GetLeftPart(UriPartial.Path);
                foreach (var match in matches)
                {
                    await _reporter.ReportAsync(match, "network", sourceIdentifier);
                }
            }

            await ForwardAsync(stream, targetUri, request, ct);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[network] error handling connection: {ex.Message}");
        }
    }

    private static bool IsScannable(string? contentType)
    {
        if (string.IsNullOrEmpty(contentType)) return false;
        return ScannableContentTypes.Any(t => contentType.StartsWith(t, StringComparison.OrdinalIgnoreCase));
    }

    private static async Task ForwardAsync(NetworkStream clientStream, Uri targetUri, HttpMessage request, CancellationToken ct)
    {
        using var upstream = new TcpClient();
        await upstream.ConnectAsync(targetUri.Host, targetUri.Port, ct);
        using var upstreamStream = upstream.GetStream();

        var originForm = targetUri.PathAndQuery;
        var headerLines = new StringBuilder();
        headerLines.Append($"{request.Method} {originForm} HTTP/1.1\r\n");
        headerLines.Append($"Host: {targetUri.Authority}\r\n");
        foreach (var (name, value) in request.Headers)
        {
            if (name is "host" or "proxy-connection" or "connection") continue;
            headerLines.Append($"{name}: {value}\r\n");
        }
        headerLines.Append("Connection: close\r\n\r\n");

        var headerBytes = Encoding.ASCII.GetBytes(headerLines.ToString());
        await upstreamStream.WriteAsync(headerBytes, ct);
        if (request.Body.Length > 0)
            await upstreamStream.WriteAsync(request.Body, ct);

        await upstreamStream.CopyToAsync(clientStream, ct);
    }

    private static async Task WriteRawAsync(NetworkStream stream, string message, CancellationToken ct)
    {
        await stream.WriteAsync(Encoding.ASCII.GetBytes(message), ct);
    }
}
