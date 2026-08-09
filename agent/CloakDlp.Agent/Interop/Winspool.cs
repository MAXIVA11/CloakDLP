using System.Runtime.InteropServices;

namespace CloakDlp.Agent.Interop;

internal static class Winspool
{
    public const uint PRINTER_CHANGE_ADD_JOB = 0x00000100;
    public const uint PRINTER_NOTIFY_OPTIONS_REFRESH = 0x1;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct JOB_INFO_1
    {
        public uint JobId;
        public string? pPrinterName;
        public string? pMachineName;
        public string? pUserName;
        public string? pDocument;
        public string? pDatatype;
        public string? pStatus;
        public uint Status;
        public uint Priority;
        public uint Position;
        public uint TotalPages;
        public uint PagesPrinted;
        public SYSTEMTIME Submitted;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEMTIME
    {
        public ushort wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1
    {
        public string? pDocName;
        public string? pOutputFile;
        public string? pDatatype;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string pPrinterName, out nint phPrinter, nint pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(nint hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool GetDefaultPrinter(System.Text.StringBuilder pszBuffer, ref uint pcchBuffer);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern nint FindFirstPrinterChangeNotification(nint hPrinter, uint fdwFilter, uint fdwOptions, nint pPrinterNotifyOptions);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool FindClosePrinterChangeNotification(nint hChange);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool FindNextPrinterChangeNotification(nint hChange, out uint pdwChange, nint pPrinterNotifyOptions, nint ppPrinterNotifyOptions);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool EnumJobs(nint hPrinter, uint firstJob, uint noJobs, uint level, nint pJob, uint cbBuf, out uint pcbNeeded, out uint pcReturned);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int StartDocPrinter(nint hPrinter, uint level, ref DOC_INFO_1 pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(nint hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(nint hPrinter, byte[] pBuf, uint cbBuf, out uint pcWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(nint hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(nint hPrinter);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(nint hHandle, uint dwMilliseconds);
}
