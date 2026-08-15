import { cn } from "@/lib/utils";

export function HeroPanel({
  total,
  blockedToday,
  loggedToday,
  agentsOnline,
  agentsTotal,
}: {
  total: number;
  blockedToday: number;
  loggedToday: number;
  agentsOnline: number;
  agentsTotal: number;
}) {
  return (
    <div className="relative mb-5 grid grid-cols-1 gap-8 overflow-hidden rounded-2xl border border-border/60 bg-card p-9 shadow-md lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full"
        style={{
          background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative">
        <p className="mb-2.5 text-xs font-semibold tracking-wide text-primary uppercase">Total caught</p>
        <p className="mb-3 font-mono text-6xl leading-none font-medium tracking-tight tabular-nums text-foreground">
          {total}
        </p>
        <p className="max-w-[46ch] text-sm text-muted-foreground">
          Card numbers, passwords, and secrets CloakDLP caught before they left this machine,
          redacted the moment they were seen and never sent anywhere in full.
        </p>
      </div>

      <div className="relative flex items-center gap-8">
        <HeroStat label="Blocked today" value={String(blockedToday)} tone="danger" />
        <HeroStat label="Logged today" value={String(loggedToday)} />
        <HeroStat label="Agents online" value={`${agentsOnline}/${agentsTotal}`} tone="safe" />
      </div>
    </div>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "safe" }) {
  const toneClass = tone ? { danger: "text-destructive", safe: "text-success" }[tone] : "text-foreground";
  return (
    <div className="flex-1">
      <div className={cn("font-mono text-2xl font-medium tabular-nums", toneClass)}>{value}</div>
      <div className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}
