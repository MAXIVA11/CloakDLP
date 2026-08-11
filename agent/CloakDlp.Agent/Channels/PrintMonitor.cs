using System.Runtime.InteropServices;
using System.Text;
using CloakDlp.Agent.Detection;
using CloakDlp.Agent.Interop;

namespace CloakDlp.Agent.Channels;

// Watches the default printer's job queue via FindFirstPrinterChangeNotification (event-driven,
// no polling). Scans each new job's document title for matches.
//
// Scope note: this reads job metadata (document name) only. Reading actual spool file content
// requires elevated access to %SystemRoot%\System32\spool\PRINTERS, which standard user
// processes don't have; full spool content inspection is a follow-up, not implemented here.
public sealed class PrintMonitor
{
    private readonly DetectorPipeline _pipeline;
    private readonly IncidentReporter _reporter;
    private readonly HashSet<uint> _seenJobIds = new();

    public PrintMonitor(DetectorPipeline pipeline, IncidentReporter reporter)
    {
        _pipeline = pipeline;
        _reporter = reporter;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        var printerName = GetDefaultPrinterName();
        if (printerName is null)
        {
            Console.Error.WriteLine("[print] no default printer found, monitor disabled.");
            return;
        }

        if (!Winspool.OpenPrinter(printerName, out var hPrinter, 0))
        {
            Console.Error.WriteLine($"[print] failed to open printer '{printerName}', monitor disabled.");
            return;
        }

        var hChange = Winspool.FindFirstPrinterChangeNotification(hPrinter, Winspool.PRINTER_CHANGE_ADD_JOB, 0, 0);
        if (hChange == 0)
        {
            Console.Error.WriteLine("[print] failed to register change notification, monitor disabled.");
            Winspool.ClosePrinter(hPrinter);
            return;
        }

        Console.WriteLine($"[print] monitoring '{printerName}' started.");
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var result = Winspool.WaitForSingleObject(hChange, 1000);
                if (result == 0) // WAIT_OBJECT_0
                {
                    await ScanNewJobsAsync(hPrinter, printerName);
                    Winspool.FindNextPrinterChangeNotification(hChange, out _, 0, 0);
                }
            }
        }
        finally
        {
            Winspool.FindClosePrinterChangeNotification(hChange);
            Winspool.ClosePrinter(hPrinter);
        }
    }

    private async Task ScanNewJobsAsync(nint hPrinter, string printerName)
    {
        foreach (var job in EnumJobs(hPrinter))
        {
            if (!_seenJobIds.Add(job.JobId)) continue;
            if (string.IsNullOrWhiteSpace(job.pDocument)) continue;

            var matches = _pipeline.Scan(job.pDocument);
            foreach (var match in matches)
            {
                await _reporter.ReportAsync(match, "print", $"{printerName} / job {job.JobId} / {job.pDocument}");
            }
        }
    }

    private static IEnumerable<Winspool.JOB_INFO_1> EnumJobs(nint hPrinter)
    {
        Winspool.EnumJobs(hPrinter, 0, 64, 1, 0, 0, out var needed, out _);
        if (needed == 0) yield break;

        var buffer = Marshal.AllocHGlobal((int)needed);
        try
        {
            if (!Winspool.EnumJobs(hPrinter, 0, 64, 1, buffer, needed, out _, out var returned))
                yield break;

            var itemSize = Marshal.SizeOf<Winspool.JOB_INFO_1>();
            for (var i = 0; i < returned; i++)
            {
                yield return Marshal.PtrToStructure<Winspool.JOB_INFO_1>(buffer + i * itemSize);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string? GetDefaultPrinterName()
    {
        var size = 0u;
        var sb = new StringBuilder();
        Winspool.GetDefaultPrinter(sb, ref size);
        if (size == 0) return null;

        sb.Capacity = (int)size;
        return Winspool.GetDefaultPrinter(sb, ref size) ? sb.ToString() : null;
    }
}
