"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ChannelBreakdown } from "@/components/channel-breakdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  exportIncidentsCsv,
  exportIncidentsPdf,
  getDashboardStats,
  getSettings,
  listIncidents,
  listPolicies,
  updateSettings,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AppSettings, DashboardStats, Incident, Policy } from "@/lib/types";

// "Forever" is represented as null on the wire; the Select needs a real string value for that
// option, so it round-trips through this sentinel at the UI boundary only.
const FOREVER = "forever";
const RETENTION_OPTIONS = [
  { value: FOREVER, label: "Keep forever" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
];

export default function ReportsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savingRetention, setSavingRetention] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  useEffect(() => {
    if (!token) return;
    getDashboardStats(token).then(setStats).catch(() => {});
    listIncidents(token, {}).then(setIncidents).catch(() => setIncidents([]));
    listPolicies(token).then(setPolicies).catch(() => {});
    getSettings(token).then(setSettings).catch(() => {});
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

  const handleExport = useCallback(
    async (format: "csv" | "pdf") => {
      if (!token) return;
      setExporting(format);
      try {
        const blob = format === "csv" ? await exportIncidentsCsv(token) : await exportIncidentsPdf(token);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cloakdlp-incidents-${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't export incidents");
      } finally {
        setExporting(null);
      }
    },
    [token],
  );

  async function handleRetentionChange(value: string) {
    if (!token) return;
    const incident_retention_days = value === FOREVER ? null : Number(value);
    setSavingRetention(true);
    try {
      const updated = await updateSettings(token, { incident_retention_days });
      setSettings(updated);
      // The save applies immediately server-side (see routers/app_settings.py), so a shorter
      // window may have just purged incidents this page is already showing - refresh in step.
      listIncidents(token, {}).then(setIncidents).catch(() => {});
      toast.success(
        incident_retention_days === null
          ? "Incidents will be kept forever"
          : `Incidents older than ${incident_retention_days} days will be purged`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update retention setting");
    } finally {
      setSavingRetention(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        description="How detections break down across policies and channels."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={exporting !== null} size="sm" variant="outline">
                <Download />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <FileSpreadsheet />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <FileText />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

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
                No incidents logged yet; this fills in once policies start matching content.
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Data retention</CardTitle>
            <CardDescription>
              How long incident records are kept before being permanently deleted. Policies, agents, and
              datasets are never affected - this only ever purges old incident history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!settings ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <Select
                value={settings.incident_retention_days === null ? FOREVER : String(settings.incident_retention_days)}
                onValueChange={handleRetentionChange}
                disabled={savingRetention}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
