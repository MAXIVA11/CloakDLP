using Microsoft.Extensions.Hosting;

namespace CloakDlp.Agent;

public sealed class AgentWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = AgentRuntime.LoadConfig();

        // A Windows Service should be resilient to the console being briefly unreachable (boot
        // ordering, network hiccups, a console restart) rather than crash-looping under the SCM.
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await AgentRuntime.RunChannelsAsync(config, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[service] channel loop failed, retrying in 30s: {ex.Message}");
            }

            if (stoppingToken.IsCancellationRequested) break;

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
