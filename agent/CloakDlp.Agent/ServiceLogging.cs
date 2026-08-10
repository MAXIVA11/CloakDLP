namespace CloakDlp.Agent;

// Windows Services have no attached console — Console.WriteLine goes nowhere. Redirect stdout
// and stderr to a rolling-by-restart log file so an operator can actually see what happened.
internal static class ServiceLogging
{
    public static void RedirectToFile()
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "CloakDLP", "logs");
        Directory.CreateDirectory(logDir);

        var logPath = Path.Combine(logDir, "agent.log");
        var writer = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.Read))
        {
            AutoFlush = true,
        };

        Console.SetOut(writer);
        Console.SetError(writer);
        Console.WriteLine($"--- service starting {DateTime.UtcNow:O} ---");
    }
}
