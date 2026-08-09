"use client";

import { Ban, Eye, FileText, Server, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ChannelBreakdown } from "@/components/channel-breakdown";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useIncidentsSocket } from "@/lib/use-incidents-socket";
import type { DashboardStats } from "@/lib/types";

export default function OverviewPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    getDashboardStats(token).then(setStats).catch(() => {});
  }, [token]);

  useEffect(() => refresh(), [refresh]);
  useIncidentsSocket(token, () => refresh());

  return (
    <div className="mx-auto max-w-6xl">
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

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
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

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Today&apos;s actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ActionRow icon={Ban} label="Blocked" value={stats.blocked_today} tone="text-destructive" />
                <ActionRow icon={Eye} label="Flagged" value={stats.flagged_today} tone="text-warning" />
                <ActionRow icon={FileText} label="Logged" value={stats.logged_today} tone="text-info" />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={`size-4 ${tone}`} />
        {label}
      </div>
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
