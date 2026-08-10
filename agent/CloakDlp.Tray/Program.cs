using System.Diagnostics;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

ApplicationConfiguration.Initialize();

RedirectLogging();
var consoleUrl = LoadConsoleUrl();
Console.WriteLine($"[tray] starting, console at {consoleUrl}");

using var trayIcon = new NotifyIcon
{
    Icon = new Icon("tray.ico"),
    Visible = true,
    Text = "CloakDLP — watching for card entry",
};

var menu = new ContextMenuStrip();
menu.Items.Add("Open console", null, (_, _) => OpenConsole());
menu.Items.Add(new ToolStripSeparator());
menu.Items.Add("Exit", null, (_, _) =>
{
    trayIcon.Visible = false;
    Application.Exit();
});
trayIcon.ContextMenuStrip = menu;
trayIcon.DoubleClick += (_, _) => OpenConsole();

var cts = new CancellationTokenSource();
Application.ApplicationExit += (_, _) => cts.Cancel();

_ = Task.Run(() => WatchIncidentsAsync(cts.Token));

Application.Run();

void OpenConsole()
{
    Process.Start(new ProcessStartInfo(consoleUrl) { UseShellExecute = true });
}

void RedirectLogging()
{
    // A tray app has no console to write to — send diagnostic output somewhere findable
    // instead, matching how the agent service logs (%ProgramData%\CloakDLP\logs).
    try
    {
        var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "CloakDLP", "logs");
        Directory.CreateDirectory(logDir);
        var writer = new StreamWriter(new FileStream(Path.Combine(logDir, "tray.log"), FileMode.Append, FileAccess.Write, FileShare.Read))
        {
            AutoFlush = true,
        };
        Console.SetOut(writer);
        Console.SetError(writer);
    }
    catch
    {
        // best-effort — a tray notifier shouldn't fail to start over a logging path issue
    }
}

string LoadConsoleUrl()
{
    try
    {
        var path = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        var json = File.ReadAllText(path);
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("ConsoleUrl", out var value) && value.GetString() is { } url)
            return url;
    }
    catch
    {
        // fall through to default
    }
    return "http://127.0.0.1:8123";
}

async Task<string?> LocalLoginAsync(CancellationToken ct)
{
    using var http = new HttpClient();
    try
    {
        var response = await http.PostAsync($"{consoleUrl}/api/auth/local-login", content: null, ct);
        if (!response.IsSuccessStatusCode) return null;
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        return body.GetProperty("access_token").GetString();
    }
    catch
    {
        return null;
    }
}

async Task WatchIncidentsAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        try
        {
            var token = await LocalLoginAsync(ct);
            if (token is null)
            {
                await Task.Delay(TimeSpan.FromSeconds(15), ct);
                continue;
            }

            var wsUrl = consoleUrl.Replace("http://", "ws://").Replace("https://", "wss://");
            using var ws = new ClientWebSocket();
            await ws.ConnectAsync(new Uri($"{wsUrl}/ws/incidents?token={Uri.EscapeDataString(token)}"), ct);
            Console.WriteLine("[tray] connected to incident feed");

            var buffer = new byte[16 * 1024];
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await ws.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close) break;
                var text = Encoding.UTF8.GetString(buffer, 0, result.Count);
                Console.WriteLine($"[tray] received: {text}");
                HandleMessage(text);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            break;
        }
        catch
        {
            // console unreachable or connection dropped — retry after a short delay
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
        }
        catch (OperationCanceledException)
        {
            break;
        }
    }
}

void HandleMessage(string json)
{
    try
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.GetProperty("type").GetString() != "incident.created") return;

        var incident = root.GetProperty("incident");
        var channel = incident.GetProperty("channel").GetString() ?? "unknown";
        var snippet = incident.GetProperty("redacted_snippet").GetString() ?? "";

        trayIcon.ShowBalloonTip(
            8000,
            "CloakDLP",
            $"A credit card number was just entered ({channel}): {snippet}",
            ToolTipIcon.Warning);
    }
    catch
    {
        // unexpected payload shape — ignore rather than crash the watcher loop
    }
}
