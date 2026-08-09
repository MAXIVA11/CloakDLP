import { Clipboard, FileText, Globe, Printer } from "lucide-react";

import type { Channel } from "@/lib/types";

const channelMeta: Record<Channel, { label: string; icon: React.ElementType; barClass: string }> = {
  file: { label: "File", icon: FileText, barClass: "bg-chart-1" },
  clipboard: { label: "Clipboard", icon: Clipboard, barClass: "bg-chart-2" },
  print: { label: "Print", icon: Printer, barClass: "bg-chart-3" },
  network: { label: "Network", icon: Globe, barClass: "bg-chart-4" },
};

export function ChannelBreakdown({ data }: { data: { channel: Channel; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex flex-col gap-4">
      {data.map((d) => {
        const meta = channelMeta[d.channel];
        const Icon = meta.icon;
        const pct = (d.count / max) * 100;
        return (
          <div key={d.channel} className="flex items-center gap-3">
            <div className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
              <Icon className="size-3.5" />
              {meta.label}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${meta.barClass} transition-[width] duration-500`}
                style={{ width: `${d.count === 0 ? 0 : Math.max(pct, 3)}%` }}
              />
            </div>
            <div className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">{d.count}</div>
          </div>
        );
      })}
    </div>
  );
}
