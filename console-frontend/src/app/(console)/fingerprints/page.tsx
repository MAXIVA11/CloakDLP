"use client";

import { Database, Fingerprint, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EdmDatasetDialog } from "@/components/edm-dataset-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, deleteEdmDataset, listEdmDatasets } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { EdmDataset } from "@/lib/types";

export default function FingerprintsPage() {
  const { token } = useAuth();
  const [datasets, setDatasets] = useState<EdmDataset[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    listEdmDatasets(token).then(setDatasets).catch(() => setDatasets([]));
  }, [token]);

  useEffect(() => load(), [load]);

  async function remove(dataset: EdmDataset) {
    if (!token) return;
    try {
      await deleteEdmDataset(token, dataset.id);
      setDatasets((prev) => prev?.filter((d) => d.id !== dataset.id) ?? prev);
      toast.success("Dataset deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete dataset");
    }
  }

  const isEmpty = datasets !== null && datasets.length === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Fingerprints"
        description="Exact data match datasets and document fingerprints used for detection."
      />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Database className="size-3.5" />
          Exact Data Match datasets
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus />
          New dataset
        </Button>
      </div>

      <div className="mb-8 overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Field type</TableHead>
              <TableHead className="w-28">Values</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {datasets === null &&
              Array.from({ length: 2 }).map((_, i) => (
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
                <TableCell colSpan={5} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground">
                    No EDM datasets yet — create one, then point an &quot;Exact data match&quot;
                    policy at it.
                  </p>
                </TableCell>
              </TableRow>
            )}

            {datasets?.map((dataset) => (
              <TableRow key={dataset.id}>
                <TableCell className="text-sm font-medium">{dataset.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {dataset.field_type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm tabular-nums">{dataset.value_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(dataset.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <button
                    aria-label="Delete dataset"
                    onClick={() => remove(dataset)}
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

      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium">
        <Fingerprint className="size-3.5" />
        Document fingerprints
      </h2>
      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Document fingerprints</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Fingerprint className="size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Not built yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Document fingerprinting via fuzzy hashing (Phase 4) lands here — partial copies,
              reformatted documents, and reference docs get matched by similarity, not exact
              content.
            </p>
          </div>
        </CardContent>
      </Card>

      <EdmDatasetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(d) => setDatasets((prev) => (prev ? [d, ...prev] : [d]))}
      />
    </div>
  );
}
