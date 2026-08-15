"use client";

import { Database, Fingerprint, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EdmDatasetDialog } from "@/components/edm-dataset-dialog";
import { FingerprintDatasetDialog } from "@/components/fingerprint-dataset-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ApiError,
  deleteEdmDataset,
  deleteFingerprint,
  listEdmDatasets,
  listFingerprints,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { EdmDataset, FingerprintDataset } from "@/lib/types";

export default function FingerprintsPage() {
  const { token } = useAuth();
  const [datasets, setDatasets] = useState<EdmDataset[] | null>(null);
  const [edmDialogOpen, setEdmDialogOpen] = useState(false);
  const [fingerprints, setFingerprints] = useState<FingerprintDataset[] | null>(null);
  const [fpDialogOpen, setFpDialogOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    listEdmDatasets(token).then(setDatasets).catch(() => setDatasets([]));
    listFingerprints(token).then(setFingerprints).catch(() => setFingerprints([]));
  }, [token]);

  useEffect(() => load(), [load]);

  async function removeEdm(dataset: EdmDataset) {
    if (!token) return;
    try {
      await deleteEdmDataset(token, dataset.id);
      setDatasets((prev) => prev?.filter((d) => d.id !== dataset.id) ?? prev);
      toast.success("Dataset deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete dataset");
    }
  }

  async function removeFingerprint(dataset: FingerprintDataset) {
    if (!token) return;
    try {
      await deleteFingerprint(token, dataset.id);
      setFingerprints((prev) => prev?.filter((d) => d.id !== dataset.id) ?? prev);
      toast.success("Fingerprint deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete fingerprint");
    }
  }

  const edmEmpty = datasets !== null && datasets.length === 0;
  const fpEmpty = fingerprints !== null && fingerprints.length === 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Fingerprints"
        description="Exact data match datasets and document fingerprints used for detection."
      />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Database className="size-3.5" />
          Exact Data Match datasets
        </h2>
        <Button size="sm" onClick={() => setEdmDialogOpen(true)}>
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

            {edmEmpty && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground">
                    No EDM datasets yet; create one, then point an &quot;Exact data match&quot;
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
                    onClick={() => removeEdm(dataset)}
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Fingerprint className="size-3.5" />
          Document fingerprints
        </h2>
        <Button size="sm" onClick={() => setFpDialogOpen(true)}>
          <Plus />
          New fingerprint
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source file</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fingerprints === null &&
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {fpEmpty && (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center">
                  <p className="text-sm text-muted-foreground">
                    No document fingerprints yet; upload a reference document, then point a
                    &quot;document fingerprint&quot; policy at it. Partial copies, reformatted
                    documents, and edited versions still match by similarity, not exact bytes.
                  </p>
                </TableCell>
              </TableRow>
            )}

            {fingerprints?.map((fp) => (
              <TableRow key={fp.id}>
                <TableCell className="text-sm font-medium">{fp.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {fp.source_filename || "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(fp.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <button
                    aria-label="Delete fingerprint"
                    onClick={() => removeFingerprint(fp)}
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

      <EdmDatasetDialog
        open={edmDialogOpen}
        onOpenChange={setEdmDialogOpen}
        onCreated={(d) => setDatasets((prev) => (prev ? [d, ...prev] : [d]))}
      />
      <FingerprintDatasetDialog
        open={fpDialogOpen}
        onOpenChange={setFpDialogOpen}
        onCreated={(d) => setFingerprints((prev) => (prev ? [d, ...prev] : [d]))}
      />
    </div>
  );
}
