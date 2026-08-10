import { Ban, Eye, FileText, ShieldQuestion } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Action, IncidentStatus } from "@/lib/types";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

const actionConfig: Record<Action, { label: string; className: string; icon: React.ElementType }> = {
  block: {
    label: "Blocked",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
    icon: Ban,
  },
  flag: {
    label: "Flagged",
    className: "bg-warning/10 text-warning dark:bg-warning/20",
    icon: Eye,
  },
  log: {
    label: "Log only",
    className: "bg-info/10 text-info dark:bg-info/20",
    icon: FileText,
  },
};

export function ActionBadge({ action }: { action: Action }) {
  const cfg = actionConfig[action];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("border-transparent", cfg.className)}>
      <Icon className="size-3" />
      {cfg.label}
    </Badge>
  );
}

const statusConfig: Record<IncidentStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-secondary text-secondary-foreground" },
  false_positive: { label: "False positive", className: "bg-muted text-muted-foreground" },
  resolved: { label: "Resolved", className: "bg-success/10 text-success dark:bg-success/20" },
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const cfg = statusConfig[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

const riskConfig: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "Low risk", className: "bg-success/10 text-success dark:bg-success/20" },
  medium: { label: "Medium risk", className: "bg-warning/10 text-warning dark:bg-warning/20" },
  high: { label: "High risk", className: "bg-destructive/10 text-destructive dark:bg-destructive/20" },
  unknown: { label: "Unscored", className: "bg-muted text-muted-foreground" },
};

export function RiskBadge({ level }: { level: RiskLevel | null }) {
  if (level === null) {
    return (
      <Badge variant="outline" className="gap-1 border-transparent bg-muted text-muted-foreground">
        <ShieldQuestion className="size-3" />
        Scoring…
      </Badge>
    );
  }
  const cfg = riskConfig[level];
  return (
    <Badge variant="outline" className={cn("border-transparent", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

export function AgentStatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        online ? "bg-success/10 text-success dark:bg-success/20" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", online ? "bg-success" : "bg-muted-foreground")} />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

export type ChannelState = "online" | "offline" | "not_installed";

export function ChannelStatusBadge({ state }: { state: ChannelState }) {
  if (state === "not_installed") {
    return (
      <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground" />
        Not installed
      </Badge>
    );
  }
  const online = state === "online";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        online ? "bg-success/10 text-success dark:bg-success/20" : "bg-warning/10 text-warning dark:bg-warning/20",
      )}
    >
      <span className={cn("size-1.5 rounded-full", online ? "bg-success" : "bg-warning")} />
      {online ? "Online" : "Offline"}
    </Badge>
  );
}
