"use client";

import { formatDistanceToNow } from "date-fns";
import { Monitor, Plus, Puzzle, Server } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AgentStatusBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, listAgents, registerAgent } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Agent } from "@/lib/types";

export default function AgentsPage() {
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [issued, setIssued] = useState<{ id: string; apiKey: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    listAgents(token).then(setAgents).catch(() => setAgents([]));
  }, [token]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleRegister() {
    if (!token || !hostname.trim()) return;
    setSaving(true);
    try {
      const result = await registerAgent(token, hostname.trim());
      setIssued({ id: result.id, apiKey: result.api_key });
      setHostname("");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't register agent");
    } finally {
      setSaving(false);
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setIssued(null);
  }

  const isEmpty = agents !== null && agents.length === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agents"
        description="Endpoints reporting into this console, and when they were last seen."
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus />
            Register agent
          </Button>
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hostname</TableHead>
              <TableHead className="w-16">Kind</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-32">Policy version</TableHead>
              <TableHead className="w-44">Last heartbeat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents === null &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isEmpty && (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Server className="size-6" />
                    <p className="text-sm">No agents registered yet.</p>
                    <p className="text-xs">Register one to get an API key for endpoint deployment.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {agents?.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-mono text-sm">{agent.hostname}</TableCell>
                <TableCell>
                  {agent.kind === "browser_extension" ? (
                    <Puzzle className="size-4 text-muted-foreground" aria-label="Browser extension" />
                  ) : (
                    <Monitor className="size-4 text-muted-foreground" aria-label="Native agent" />
                  )}
                </TableCell>
                <TableCell>
                  <AgentStatusBadge status={agent.status} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {agent.policy_version || "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {agent.last_heartbeat
                    ? formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true })
                    : "Never"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register agent</DialogTitle>
            <DialogDescription>
              Issues an API key for a new endpoint. The key is shown once — copy it into the
              agent's configuration before closing this dialog.
            </DialogDescription>
          </DialogHeader>

          {!issued ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hostname">Hostname</Label>
              <Input
                id="hostname"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="WORKSTATION-042"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Agent ID</Label>
                <Input readOnly value={issued.id} className="font-mono text-xs" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>API key</Label>
                <Input readOnly value={issued.apiKey} className="font-mono text-xs" />
              </div>
              <p className="text-xs text-muted-foreground">
                This won&apos;t be shown again. Set it as <code className="font-mono">AgentId</code> /{" "}
                <code className="font-mono">ApiKey</code> in the agent&apos;s configuration.
              </p>
            </div>
          )}

          <DialogFooter>
            {!issued ? (
              <>
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={handleRegister} disabled={saving || !hostname.trim()}>
                  {saving ? "Registering…" : "Register"}
                </Button>
              </>
            ) : (
              <Button onClick={closeDialog}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
