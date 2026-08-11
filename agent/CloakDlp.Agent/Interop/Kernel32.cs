using System.Runtime.InteropServices;

namespace CloakDlp.Agent.Interop;

internal static class Kernel32
{
    // Used instead of Marshal.GetHINSTANCE(Module); that API returns -1 for assemblies bundled
    // into a single-file publish (no discrete file on disk to point at), which breaks
    // RegisterClassEx. GetModuleHandle(null) returns the process's own module handle regardless
    // of how the managed assembly was packaged.
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern nint GetModuleHandle(string? lpModuleName);
}
