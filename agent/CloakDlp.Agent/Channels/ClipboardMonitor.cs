using System.Runtime.InteropServices;
using CloakDlp.Agent.Detection;
using CloakDlp.Agent.Interop;

namespace CloakDlp.Agent.Channels;

// Win32 clipboard listener: a message-only window registers for WM_CLIPBOARDUPDATE via
// AddClipboardFormatListener. No polling — the OS wakes us only when the clipboard changes.
public sealed class ClipboardMonitor
{
    private readonly DetectorPipeline _pipeline;
    private readonly IncidentReporter _reporter;
    private string? _lastSeenText;

    public ClipboardMonitor(DetectorPipeline pipeline, IncidentReporter reporter)
    {
        _pipeline = pipeline;
        _reporter = reporter;
    }

    public void Run(CancellationToken ct)
    {
        // Keep the delegate alive for the window's lifetime — otherwise the GC can collect it
        // while user32 still holds a native pointer to it, corrupting the message loop.
        User32.WndProcDelegate wndProc = WndProc;

        var wc = new User32.WNDCLASSEX
        {
            cbSize = (uint)Marshal.SizeOf<User32.WNDCLASSEX>(),
            lpfnWndProc = wndProc,
            lpszClassName = "CloakDlpClipboardListener",
            hInstance = Marshal.GetHINSTANCE(typeof(ClipboardMonitor).Module),
        };

        if (User32.RegisterClassEx(ref wc) == 0)
        {
            Console.Error.WriteLine("[clipboard] failed to register window class, monitor disabled.");
            return;
        }

        var hwnd = User32.CreateWindowEx(0, wc.lpszClassName!, "", 0, 0, 0, 0, 0, User32.HWND_MESSAGE, 0, wc.hInstance, 0);
        if (hwnd == 0)
        {
            Console.Error.WriteLine("[clipboard] failed to create listener window, monitor disabled.");
            return;
        }

        if (!User32.AddClipboardFormatListener(hwnd))
        {
            Console.Error.WriteLine("[clipboard] failed to register clipboard listener.");
            return;
        }

        Console.WriteLine("[clipboard] monitoring started.");
        try
        {
            while (!ct.IsCancellationRequested)
            {
                while (User32.PeekMessage(out var msg, 0, 0, 0, User32.PM_REMOVE))
                {
                    User32.TranslateMessage(ref msg);
                    User32.DispatchMessage(ref msg);
                }
                Thread.Sleep(100);
            }
        }
        finally
        {
            User32.RemoveClipboardFormatListener(hwnd);
            User32.DestroyWindow(hwnd);
        }
    }

    private nint WndProc(nint hWnd, uint msg, nint wParam, nint lParam)
    {
        if (msg == User32.WM_CLIPBOARDUPDATE)
        {
            OnClipboardChanged();
        }
        return User32.DefWindowProc(hWnd, msg, wParam, lParam);
    }

    private void OnClipboardChanged()
    {
        var text = TryReadClipboardText();
        if (string.IsNullOrEmpty(text)) return;
        if (text == _lastSeenText) return;
        _lastSeenText = text;

        var matches = _pipeline.Scan(text);
        foreach (var match in matches)
        {
            _reporter.ReportAsync(match, "clipboard", "clipboard").GetAwaiter().GetResult();
        }
    }

    private static string? TryReadClipboardText()
    {
        if (!User32.IsClipboardFormatAvailable(User32.CF_UNICODETEXT)) return null;
        if (!User32.OpenClipboard(0)) return null;

        try
        {
            var handle = User32.GetClipboardData(User32.CF_UNICODETEXT);
            if (handle == 0) return null;

            var ptr = User32.GlobalLock(handle);
            if (ptr == 0) return null;

            try
            {
                return Marshal.PtrToStringUni(ptr);
            }
            finally
            {
                User32.GlobalUnlock(handle);
            }
        }
        finally
        {
            User32.CloseClipboard();
        }
    }
}
