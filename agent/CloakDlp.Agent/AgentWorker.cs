using Microsoft.Extensions.Hosting;

namespace CloakDlp.Agent;

public sealed class AgentWorker : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // A Windows Service should be resilient to the console being briefly unreachable (boot
        // ordering, network hiccups, a console restart) rather than crash-looping under the SCM.
        // Config is (re)loaded every iteration so a pairing attempt that failed because the
        // console hadn't started yet gets retried automatically, not just once at startup.
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var config = await AgentRuntime.LoadConfigAsync();
                await AgentRuntime.RunChannelsAsync(config, stoppingToken, includeClipboard: false);
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
