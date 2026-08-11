"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronDown, Monitor, Plus, Puzzle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AgentStatusBadge, ChannelStatusBadge, type ChannelState } from "@/components/badges";
import { ExtensionInstallDialog } from "@/components/extension-install-dialog";
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
import { ApiError, deleteAgent, getWorkstationStatus, listAgents, registerAgent } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Agent, ChannelStatus, WorkstationStatus } from "@/lib/types";

function channelState(channel: ChannelStatus): ChannelState {
  if (!channel.installed) return "not_installed";
  return channel.online ? "online" : "offline";
}

function lastSeenText(channel: ChannelStatus): string {
  if (!channel.installed) return "Never installed";
  if (!channel.last_heartbeat) return "Never checked in";
  return `Last seen ${formatDistanceToNow(new Date(channel.last_heartbeat), { addSuffix: true })}`;
}

export default function AgentsPage() {
  const { token } = useAuth();
  const [workstation, setWorkstation] = useState<WorkstationStatus | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [issued, setIssued] = useState<{ id: string; apiKey: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    getWorkstationStatus(token).then(setWorkstation).catch(() => {});
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

  async function handleDelete(agent: Agent) {
    if (!token) return;
    try {
      await deleteAgent(token, agent.id);
      setAgents((prev) => prev?.filter((a) => a.id !== agent.id) ?? prev);
      load();
      toast.success(`Removed ${agent.hostname}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove agent");
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    setIssued(null);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agents"
        description="What's protecting this workstation, and whether it's actually running."
      />

      {!workstation ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : (
        <div className="rounded-lg border">
          <div className="border-b px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">This workstation</p>
            <p className="font-mono text-lg font-semibold">{workstation.hostname ?? "Not paired yet"}</p>
          </div>

          <div className="divide-y">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Monitor className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Desktop agent</p>
                <p className="text-xs text-muted-foreground">Clipboard, file, print, and plain-HTTP network</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ChannelStatusBadge state={channelState(workstation.desktop_agent)} />
                <p className="text-xs text-muted-foreground">{lastSeenText(workstation.desktop_agent)}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Puzzle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Browser extension</p>
                <p className="text-xs text-muted-foreground">Card numbers typed into checkout pages</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ChannelStatusBadge state={channelState(workstation.browser_extension)} />
                <p className="text-xs text-muted-foreground">{lastSeenText(workstation.browser_extension)}</p>
              </div>
              {!workstation.browser_extension.installed && (
                <>
                  {workstation.extension_store_url ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={workstation.extension_store_url} target="_blank" rel="noopener noreferrer">
                        Install
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setInstallDialogOpen(true)}>
                      Install
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          Advanced
        </button>

        {advancedOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Every agent record the console has ever paired with, including stale ones. Manual
                registration is only for troubleshooting; both the desktop agent and the browser
                extension pair themselves automatically on first run.
              </p>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => setDialogOpen(true)}>
                <Plus />
                Register manually
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead className="w-24">Kind</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-32">Policy version</TableHead>
                    <TableHead className="w-44">Last heartbeat</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents === null &&
                    Array.from({ length: 2 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {agents !== null && agents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                        No agents registered yet.
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
                        <AgentStatusBadge online={agent.online} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {agent.policy_version || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {agent.last_heartbeat
                          ? formatDistanceToNow(new Date(agent.last_heartbeat), { addSuffix: true })
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <button
                          aria-label={`Remove ${agent.hostname}`}
                          onClick={() => handleDelete(agent)}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register agent manually</DialogTitle>
            <DialogDescription>
              Issues an API key for a new endpoint. The key is shown once; copy it into the
              agent's configuration before closing this dialog. Only needed if automatic pairing
              didn't work.
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

      <ExtensionInstallDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
    </div>
  );
}
