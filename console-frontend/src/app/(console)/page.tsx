"use client";

import { formatDistanceToNow } from "date-fns";
import { Ban, Eye, Server, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ActionBadge } from "@/components/badges";
import { ChannelBreakdown } from "@/components/channel-breakdown";
import { HeroPanel } from "@/components/hero-panel";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { RedactedSnippet } from "@/components/redacted-snippet";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDashboardStats, listIncidents, listPolicies } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useIncidentsSocket } from "@/lib/use-incidents-socket";
import type { DashboardStats, Incident, Policy } from "@/lib/types";

export default function OverviewPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);

  const refresh = useCallback(() => {
    if (!token) return;
    getDashboardStats(token).then(setStats).catch(() => {});
    listIncidents(token, {}).then(setIncidents).catch(() => setIncidents([]));
  }, [token]);

  useEffect(() => refresh(), [refresh]);
  useEffect(() => {
    if (token) listPolicies(token).then(setPolicies).catch(() => {});
  }, [token]);
  useIncidentsSocket(token, () => refresh());

  const byPolicy = useMemo(() => {
    if (!incidents) return [];
    const policyNames = new Map(policies.map((p) => [p.id, p.name]));
    const counts = new Map<string, number>();
    for (const incident of incidents) {
      counts.set(incident.policy_id, (counts.get(incident.policy_id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([policyId, count]) => ({ policyId, name: policyNames.get(policyId) ?? "Unknown policy", count }))
      .sort((a, b) => b.count - a.count);
  }, [incidents, policies]);

  const statusCounts = useMemo(() => {
    if (!incidents) return { open: 0, false_positive: 0, resolved: 0 };
    return incidents.reduce(
      (acc, i) => ({ ...acc, [i.status]: acc[i.status as keyof typeof acc] + 1 }),
      { open: 0, false_positive: 0, resolved: 0 },
    );
  }, [incidents]);

  const recent = incidents?.slice(0, 6) ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Overview"
        description="Detection posture across every monitored channel."
      />

      {!stats ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <HeroPanel
            total={incidents?.length ?? 0}
            blockedToday={stats.blocked_today}
            loggedToday={stats.logged_today}
            agentsOnline={stats.agents_online}
            agentsTotal={stats.agents_total}
          />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Blocked today" value={String(stats.blocked_today)} icon={Ban} tone="danger" />
            <MetricCard
              label="Active policies"
              value={String(stats.active_policies)}
              icon={ShieldCheck}
              tone="default"
            />
            <MetricCard
              label="Agents online"
              value={`${stats.agents_online}/${stats.agents_total}`}
              icon={Server}
              tone="info"
            />
            <MetricCard
              label="False-positive rate"
              value={`${(stats.false_positive_rate * 100).toFixed(1)}%`}
              icon={Eye}
              tone="warning"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Detections by channel</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.channel_breakdown.every((c) => c.count === 0) ? (
                  <EmptyState />
                ) : (
                  <ChannelBreakdown data={stats.channel_breakdown} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Detections by policy</CardTitle>
              </CardHeader>
              <CardContent>
                {byPolicy.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {byPolicy.map((p) => (
                      <div
                        key={p.policyId}
                        className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="ml-3 font-mono tabular-nums text-muted-foreground">{p.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Incident status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {incidents === null ? (
                  <Skeleton className="h-32 w-full" />
                ) : incidents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No incidents logged yet.</p>
                ) : (
                  <>
                    <StatusRow label="Open" value={statusCounts.open} />
                    <StatusRow label="False positive" value={statusCounts.false_positive} />
                    <StatusRow label="Resolved" value={statusCounts.resolved} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Recent incidents</CardTitle>
              <CardAction>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/incidents">View all &rarr;</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing caught yet. Incidents show up here the moment an agent reports a match.
                </p>
              ) : (
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((incident) => (
                        <TableRow key={incident.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(incident.timestamp), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-sm capitalize">{incident.channel}</TableCell>
                          <TableCell>
                            <ActionBadge action={incident.action_taken} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {incident.rule_id}
                          </TableCell>
                          <TableCell>
                            <RedactedSnippet value={incident.redacted_snippet} />
                          </TableCell>
                          <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                            {incident.source_identifier || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        No detections yet. Once an agent reports a match, this breaks it down by channel.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href="/policies">Set up a policy</Link>
      </Button>
    </div>
  );
}
