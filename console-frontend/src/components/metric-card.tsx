import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "warning" | "info";
}) {
  const chipClass = {
    default: "bg-muted text-muted-foreground",
    danger: "bg-destructive/12 text-destructive",
    warning: "bg-warning/12 text-warning",
    info: "bg-primary/12 text-primary",
  }[tone];

  return (
    <Card className="gap-3 py-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex flex-col gap-3 px-5">
        <span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", chipClass)}>
            <Icon className="size-3.5" />
          </span>
          {label}
        </span>
        <span className="font-mono text-2xl font-medium tabular-nums text-foreground">{value}</span>
      </CardContent>
    </Card>
  );
}
