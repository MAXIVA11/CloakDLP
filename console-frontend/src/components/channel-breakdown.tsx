import { Clipboard, FileText, Globe, Printer } from "lucide-react";

import type { Channel } from "@/lib/types";

const channelMeta: Record<Channel, { label: string; icon: React.ElementType; color: string }> = {
  network: { label: "Network", icon: Globe, color: "var(--color-chart-1)" },
  print: { label: "Print", icon: Printer, color: "var(--color-chart-4)" },
  clipboard: { label: "Clipboard", icon: Clipboard, color: "var(--color-chart-2)" },
  file: { label: "File", icon: FileText, color: "var(--color-chart-3)" },
};

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ChannelBreakdown({ data }: { data: { channel: Channel; count: number }[] }) {
  const total = Math.max(
    1,
    data.reduce((sum, d) => sum + d.count, 0),
  );

  let cumulative = 0;
  const segments = data.map((d) => {
    const dash = (d.count / total) * CIRCUMFERENCE;
    const offset = -cumulative;
    cumulative += dash;
    return { ...d, dash, offset };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={120} height={120} viewBox="0 0 120 120" className="shrink-0" aria-hidden>
        <circle cx={60} cy={60} r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth={16} />
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <circle
              key={s.channel}
              cx={60}
              cy={60}
              r={RADIUS}
              fill="none"
              stroke={channelMeta[s.channel].color}
              strokeWidth={16}
              strokeDasharray={`${s.dash} ${CIRCUMFERENCE}`}
              strokeDashoffset={s.offset}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              className="transition-[stroke-dasharray] duration-500"
            />
          ))}
      </svg>
      <div className="flex flex-1 flex-col gap-2.5">
        {data.map((d) => {
          const meta = channelMeta[d.channel];
          const Icon = meta.icon;
          return (
            <div key={d.channel} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              <Icon className="size-3.5 shrink-0" />
              {meta.label}
              <span className="ml-auto font-mono text-foreground tabular-nums">{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
