using System.Diagnostics;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using CloakDlp.Agent;
using CloakDlp.Agent.Channels;
using CloakDlp.Agent.Config;
using CloakDlp.Agent.ConsoleApi;
using CloakDlp.Agent.Detection;

ApplicationConfiguration.Initialize();

RedirectLogging();
var consoleUrl = LoadConsoleUrl();
Console.WriteLine($"[tray] starting, console at {consoleUrl}");

// An icon path resolved relative to the *current working directory* rather than the exe's own
// directory is fragile: launched via the Startup-folder shortcut it happens to work (the
// shortcut sets WorkingDirectory=TRAYDIR), but any other launch path (double-click from
// Explorer, a different shortcut, Task Scheduler) can leave the CWD pointed elsewhere. Icon's
// constructor throws FileNotFoundException when that happens, which crashes this whole
// top-level-statements program before the tray icon or logging even come up; silently, since
// there's no console to show the exception on. AppContext.BaseDirectory is always correct.
using var trayIcon = new NotifyIcon
{
    Icon = new Icon(Path.Combine(AppContext.BaseDirectory, "tray.ico")),
    Visible = true,
    Text = "CloakDLP: watching for card entry",
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
_ = Task.Run(() => WatchClipboardAsync(cts.Token));

Application.Run();

void OpenConsole()
{
    Process.Start(new ProcessStartInfo(consoleUrl) { UseShellExecute = true });
}

void RedirectLogging()
{
    // A tray app has no console to write to; send diagnostic output somewhere findable
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
        // best-effort; a tray notifier shouldn't fail to start over a logging path issue
    }
}

string LoadConsoleUrl()
{
    try
    {
        var path = Path.Combine(AppContext.BaseDirectory, "tray-config.json");
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
            // console unreachable or connection dropped; retry after a short delay
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

// Clipboard detection lives here, not in the CloakDLP Agent Windows Service, because Windows
// Services run in Session 0 and cannot receive WM_CLIPBOARDUPDATE from the interactive desktop
// session no matter how correct the listener code is (confirmed directly: the service logged
// "monitoring started" and then nothing, ever, even with a valid card number on the clipboard).
// This reuses the desktop agent's own identity (agent_credentials.json, written by
// CloakDlp.Agent) to report incidents, rather than self-registering a second agent - self-
// register is idempotent per (hostname, kind), so a second "native" registration here would
// silently reissue a fresh API key and invalidate the one the actual agent service is using.
async Task WatchClipboardAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        var stored = AgentCredentialStore.Load();
        if (stored is not { DefaultCreditCardPolicyId: { Length: > 0 } } creds)
        {
            // Desktop agent hasn't paired yet (fresh install, console still starting) or its
            // stored credentials predate the credit-card policy id; nothing to report against
            // yet. Check again shortly rather than starting a listener that can never report.
            try { await Task.Delay(TimeSpan.FromSeconds(15), ct); } catch (OperationCanceledException) { break; }
            continue;
        }

        var config = new AgentConfig { ConsoleUrl = consoleUrl, AgentId = creds.AgentId, ApiKey = creds.ApiKey };
        config.PolicyIdsByDataType["credit_card"] = creds.DefaultCreditCardPolicyId!;

        using var client = new ConsoleApiClient(config);
        var reporter = new IncidentReporter(client, config.PolicyIdsByDataType);
        var pipeline = new DetectorPipeline();
        var clipboard = new ClipboardMonitor(pipeline, reporter);

        Console.WriteLine("[clipboard] starting, reusing desktop agent identity.");
        try
        {
            clipboard.Run(ct);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[clipboard] listener crashed, restarting shortly: {ex.Message}");
        }

        if (ct.IsCancellationRequested) break;
        try { await Task.Delay(TimeSpan.FromSeconds(15), ct); } catch (OperationCanceledException) { break; }
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

        // ToolTipIcon.None (rather than .Warning) is deliberate: it stops Windows from
        // overlaying its own generic system warning triangle on top of the notification,
        // leaving the CloakDLP icon set on trayIcon.Icon above as the one actually shown.
        trayIcon.ShowBalloonTip(
            8000,
            "CloakDLP",
            $"A credit card number was just entered ({channel}): {snippet}",
            ToolTipIcon.None);
    }
    catch
    {
        // unexpected payload shape; ignore rather than crash the watcher loop
    }
}
