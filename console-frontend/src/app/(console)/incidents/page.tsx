"use client";

import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ActionBadge, IncidentStatusBadge, RiskBadge, type RiskLevel } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { RedactedSnippet } from "@/components/redacted-snippet";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, listIncidents, updateIncidentStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useIncidentsSocket } from "@/lib/use-incidents-socket";
import type { Incident } from "@/lib/types";

export default function IncidentsPage() {
  const { token } = useAuth();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!token) return;
    listIncidents(token, {
      channel: channel === "all" ? undefined : channel,
      status: status === "all" ? undefined : status,
    })
      .then(setIncidents)
      .catch(() => setIncidents([]));
  }, [token, channel, status]);

  useEffect(() => load(), [load]);

  const flashNew = useCallback((id: string) => {
    setNewIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1600);
  }, []);

  useIncidentsSocket(
    token,
    useCallback(
      (event) => {
        if (event.type === "incident.created") {
          const matchesFilter =
            (channel === "all" || event.incident.channel === channel) &&
            (status === "all" || event.incident.status === status);
          if (!matchesFilter) return;
          setIncidents((prev) => (prev ? [event.incident, ...prev] : [event.incident]));
          flashNew(event.incident.id);
        } else if (event.type === "incident.updated") {
          setIncidents((prev) =>
            prev ? prev.map((i) => (i.id === event.incident.id ? event.incident : i)) : prev,
          );
        }
      },
      [channel, status, flashNew],
    ),
  );

  async function setIncidentStatus(id: string, next: Incident["status"]) {
    if (!token) return;
    try {
      const updated = await updateIncidentStatus(token, id, next);
      setIncidents((prev) => (prev ? prev.map((i) => (i.id === id ? updated : i)) : prev));
      toast.success(next === "false_positive" ? "Marked as false positive" : "Incident updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update incident");
    }
  }

  const isEmpty = useMemo(() => incidents !== null && incidents.length === 0, [incidents]);

  function riskInfo(incident: Incident): { domain: string | null; level: RiskLevel | null } {
    const domain = typeof incident.extra?.domain === "string" ? incident.extra.domain : null;
    const level = typeof incident.extra?.risk_level === "string" ? (incident.extra.risk_level as RiskLevel) : null;
    return { domain, level };
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Incidents"
        description="Live feed of policy matches reported by agents across every channel."
      />

      <div className="mb-4 flex items-center gap-2">
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="file">File</SelectItem>
            <SelectItem value="clipboard">Clipboard</SelectItem>
            <SelectItem value="print">Print</SelectItem>
            <SelectItem value="network">Network</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="false_positive">False positive</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto gap-1.5 border-transparent bg-muted text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-success" />
          Live
        </Badge>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Time</TableHead>
              <TableHead className="w-24">Channel</TableHead>
              <TableHead className="w-28">Action</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Snippet</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-32">Risk</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents === null &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isEmpty && (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ShieldAlert className="size-6" />
                    <p className="text-sm">No incidents match this view yet.</p>
                    <p className="text-xs">
                      They&apos;ll show up here the moment an agent reports a policy match.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {incidents?.map((incident) => (
              <TableRow key={incident.id} className={newIds.has(incident.id) ? "incident-row-new" : ""}>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(incident.timestamp), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-sm capitalize">{incident.channel}</TableCell>
                <TableCell>
                  <ActionBadge action={incident.action_taken} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{incident.rule_id}</TableCell>
                <TableCell>
                  <RedactedSnippet value={incident.redacted_snippet} />
                </TableCell>
                <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                  {riskInfo(incident).domain ?? incident.source_identifier ?? "-"}
                </TableCell>
                <TableCell>
                  {incident.channel === "network" ? (
                    <RiskBadge level={riskInfo(incident).level} />
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <IncidentStatusBadge status={incident.status} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Incident actions"
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setIncidentStatus(incident.id, "false_positive")}>
                        Mark false positive
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIncidentStatus(incident.id, "resolved")}>
                        Mark resolved
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIncidentStatus(incident.id, "open")}>
                        Reopen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
