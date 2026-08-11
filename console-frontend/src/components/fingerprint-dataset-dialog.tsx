"use client";

import { useState } from "react";
import { toast } from "sonner";

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
import { ApiError, createFingerprint } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { FingerprintDataset } from "@/lib/types";

export function FingerprintDatasetDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dataset: FingerprintDataset) => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!token) return;
    if (!name.trim()) {
      toast.error("Give the document a name");
      return;
    }
    if (!file) {
      toast.error("Choose a file to fingerprint");
      return;
    }
    setSaving(true);
    try {
      const dataset = await createFingerprint(token, name.trim(), file);
      toast.success("Document fingerprinted; original content was not stored");
      onCreated(dataset);
      onOpenChange(false);
      setName("");
      setFile(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create fingerprint");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New document fingerprint</DialogTitle>
          <DialogDescription>
            The file is hashed right here in the console and discarded immediately; only the
            fuzzy hash is stored, never the document itself.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fp-name">Name</Label>
            <Input
              id="fp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q3 board deck"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fp-file">File</Label>
            <Input id="fp-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Hashing & saving…" : "Create fingerprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
