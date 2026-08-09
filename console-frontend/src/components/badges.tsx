import { Ban, Eye, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Action, AgentStatus, IncidentStatus } from "@/lib/types";

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

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const isOnline = status === "online";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        isOnline ? "bg-success/10 text-success dark:bg-success/20" : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", isOnline ? "bg-success" : "bg-muted-foreground")}
      />
      {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}
