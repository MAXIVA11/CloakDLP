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
  const toneClass = {
    default: "text-primary bg-primary/10",
    danger: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/10",
    info: "text-info bg-info/10",
  }[tone];

  return (
    <Card className="gap-3 py-5">
      <CardContent className="flex items-center justify-between px-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", toneClass)}>
          <Icon className="size-4.5" />
        </div>
      </CardContent>
    </Card>
  );
}
