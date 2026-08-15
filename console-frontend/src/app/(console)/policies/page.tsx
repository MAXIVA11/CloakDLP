"use client";

import { MoreHorizontal, Plus, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { PolicyEditorDialog } from "@/components/policy-editor-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, deletePolicy, listPolicies, updatePolicy } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Policy } from "@/lib/types";

export default function PoliciesPage() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    listPolicies(token).then(setPolicies).catch(() => setPolicies([]));
  }, [token]);

  useEffect(() => load(), [load]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(policy: Policy) {
    setEditing(policy);
    setDialogOpen(true);
  }

  function handleSaved(policy: Policy) {
    setPolicies((prev) => {
      if (!prev) return [policy];
      const exists = prev.some((p) => p.id === policy.id);
      return exists ? prev.map((p) => (p.id === policy.id ? policy : p)) : [policy, ...prev];
    });
  }

  async function toggleEnabled(policy: Policy) {
    if (!token) return;
    try {
      const updated = await updatePolicy(token, policy.id, { enabled: !policy.enabled });
      handleSaved(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update policy");
    }
  }

  async function remove(policy: Policy) {
    if (!token) return;
    try {
      await deletePolicy(token, policy.id);
      setPolicies((prev) => prev?.filter((p) => p.id !== policy.id) ?? prev);
      toast.success("Policy deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete policy");
    }
  }

  const isEmpty = policies !== null && policies.length === 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Policies"
        description="Rules that decide what gets detected, where, and what happens next."
        action={
          <Button onClick={openCreate} size="sm">
            <Plus />
            New policy
          </Button>
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-40">Data type</TableHead>
              <TableHead className="w-44">Channels</TableHead>
              <TableHead className="w-28">Mode</TableHead>
              <TableHead className="w-20">Enabled</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies === null &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {isEmpty && (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ShieldCheck className="size-6" />
                    <p className="text-sm">No policies yet.</p>
                    <p className="text-xs">Create one to start detecting sensitive content.</p>
                    <Button size="sm" variant="outline" className="mt-1" onClick={openCreate}>
                      New policy
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {policies?.map((policy) => (
              <TableRow key={policy.id} className="cursor-pointer" onClick={() => openEdit(policy)}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{policy.name}</span>
                    {policy.description && (
                      <span className="max-w-72 truncate text-xs text-muted-foreground">
                        {policy.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{policy.data_type.replace("_", " ")}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {policy.channels.map((c) => (
                      <Badge key={c} variant="outline" className="capitalize">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm capitalize">{policy.action === "log" ? "Log Only" : "Block"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch checked={policy.enabled} onCheckedChange={() => toggleEnabled(policy)} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Policy actions"
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(policy)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => remove(policy)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PolicyEditorDialog open={dialogOpen} onOpenChange={setDialogOpen} policy={editing} onSaved={handleSaved} />
    </div>
  );
}
