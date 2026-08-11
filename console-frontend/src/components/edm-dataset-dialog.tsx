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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createEdmDataset } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { EdmDataset, EdmFieldType } from "@/lib/types";

export function EdmDatasetDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dataset: EdmDataset) => void;
}) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<EdmFieldType>("email");
  const [valuesText, setValuesText] = useState("");
  const [saving, setSaving] = useState(false);

  const values = valuesText
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  async function handleSave() {
    if (!token) return;
    if (!name.trim()) {
      toast.error("Give the dataset a name");
      return;
    }
    if (values.length === 0) {
      toast.error("Paste at least one value");
      return;
    }
    setSaving(true);
    try {
      const dataset = await createEdmDataset(token, { name: name.trim(), field_type: fieldType, values });
      toast.success(`Dataset created: ${dataset.value_count} unique value(s) hashed`);
      onCreated(dataset);
      onOpenChange(false);
      setName("");
      setValuesText("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create dataset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New EDM dataset</DialogTitle>
          <DialogDescription>
            Paste one value per line. Each is normalized, salted, and hashed right here in the
            console before storage; the raw values in the box below are never saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataset-name">Name</Label>
            <Input
              id="dataset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer emails"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Field type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as EdmFieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email address</SelectItem>
                <SelectItem value="number">Number (account/customer ID, etc.)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataset-values">Values ({values.length} parsed)</Label>
            <Textarea
              id="dataset-values"
              value={valuesText}
              onChange={(e) => setValuesText(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={fieldType === "email" ? "jane@example.com\njohn@example.com" : "4111000000001111\n9001234567"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Hashing & saving…" : "Create dataset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
