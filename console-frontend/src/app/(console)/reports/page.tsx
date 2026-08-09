"use client";

import { useEffect, useMemo, useState } from "react";

import { ChannelBreakdown } from "@/components/channel-breakdown";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats, listIncidents, listPolicies } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { DashboardStats, Incident, Policy } from "@/lib/types";

export default function ReportsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);

  useEffect(() => {
    if (!token) return;
    getDashboardStats(token).then(setStats).catch(() => {});
    listIncidents(token, {}).then(setIncidents).catch(() => setIncidents([]));
    listPolicies(token).then(setPolicies).catch(() => {});
  }, [token]);

  const byPolicy = useMemo(() => {
    if (!incidents) return [];
    const policyNames = new Map(policies.map((p) => [p.id, p.name]));
    const counts = new Map<string, number>();
    for (const incident of incidents) {
      counts.set(incident.policy_id, (counts.get(incident.policy_id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([policyId, count]) => ({ name: policyNames.get(policyId) ?? "Unknown policy", count }))
      .sort((a, b) => b.count - a.count);
  }, [incidents, policies]);

  const statusCounts = useMemo(() => {
    if (!incidents) return { open: 0, false_positive: 0, resolved: 0 };
    return incidents.reduce(
      (acc, i) => ({ ...acc, [i.status]: acc[i.status as keyof typeof acc] + 1 }),
      { open: 0, false_positive: 0, resolved: 0 },
    );
  }, [incidents]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reports" description="How detections break down across policies and channels." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Detections by channel</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ChannelBreakdown data={stats.channel_breakdown} />
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Detections by policy</CardTitle>
          </CardHeader>
          <CardContent>
            {byPolicy.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No incidents logged yet — this fills in once policies start matching content.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {byPolicy.map((p) => (
                  <div key={p.name} className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                    <span>{p.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
