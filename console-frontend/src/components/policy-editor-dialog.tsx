"use client";

import { Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RedactedSnippet } from "@/components/redacted-snippet";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createPolicy, listEdmDatasets, listFingerprints, listIncidents, updatePolicy } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  Action,
  Channel,
  DataType,
  DetectionMethod,
  EdmDataset,
  FingerprintDataset,
  Incident,
  Policy,
  PolicyInput,
} from "@/lib/types";

const DETECTION_METHOD_BY_DATA_TYPE: Record<DataType, DetectionMethod> = {
  credit_card: "regex",
  ssn: "regex",
  api_key: "regex",
  private_key: "regex",
  edm_dataset: "edm",
  fingerprint_doc: "fingerprint",
};

const ALL_CHANNELS: Channel[] = ["file", "clipboard", "print", "network"];

const DATA_TYPE_LABELS: Record<DataType, string> = {
  credit_card: "Credit card (regex + Luhn)",
  ssn: "SSN (regex)",
  api_key: "API key (regex)",
  private_key: "Private key (regex)",
  edm_dataset: "Exact data match",
  fingerprint_doc: "Document fingerprint",
};

function emptyForm(): PolicyInput {
  return {
    name: "",
    description: "",
    data_type: "credit_card",
    detection_method: "regex",
    channels: ["file"],
    action: "log",
    target_scope: {},
    enabled: true,
    simulate_mode: true,
    edm_dataset_id: null,
    fingerprint_dataset_id: null,
  };
}

export function PolicyEditorDialog({
  open,
  onOpenChange,
  policy,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: Policy | null;
  onSaved: (policy: Policy) => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<PolicyInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [edmDatasets, setEdmDatasets] = useState<EdmDataset[]>([]);
  const [fingerprints, setFingerprints] = useState<FingerprintDataset[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(policy ? { ...policy } : emptyForm());
  }, [open, policy]);

  useEffect(() => {
    if (!open || !token) return;
    listIncidents(token, {}).then(setIncidents).catch(() => setIncidents([]));
    listEdmDatasets(token).then(setEdmDatasets).catch(() => setEdmDatasets([]));
    listFingerprints(token).then(setFingerprints).catch(() => setFingerprints([]));
  }, [open, token]);

  function setDataType(dataType: DataType) {
    setForm((f) => ({
      ...f,
      data_type: dataType,
      detection_method: DETECTION_METHOD_BY_DATA_TYPE[dataType],
      edm_dataset_id: dataType === "edm_dataset" ? f.edm_dataset_id : null,
      fingerprint_dataset_id: dataType === "fingerprint_doc" ? f.fingerprint_dataset_id : null,
    }));
  }

  const preview = useMemo(
    () => incidents.filter((i) => form.channels.includes(i.channel)).slice(0, 5),
    [incidents, form.channels],
  );
  const previewCount = useMemo(
    () => incidents.filter((i) => form.channels.includes(i.channel)).length,
    [incidents, form.channels],
  );

  function toggleChannel(channel: Channel) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(channel)
        ? f.channels.filter((c) => c !== channel)
        : [...f.channels, channel],
    }));
  }

  async function handleSave() {
    if (!token) return;
    if (!form.name.trim()) {
      toast.error("Give the policy a name");
      return;
    }
    if (form.channels.length === 0) {
      toast.error("Select at least one channel");
      return;
    }
    if (form.data_type === "edm_dataset" && !form.edm_dataset_id) {
      toast.error("Pick a dataset for this EDM policy");
      return;
    }
    if (form.data_type === "fingerprint_doc" && !form.fingerprint_dataset_id) {
      toast.error("Pick a document for this fingerprint policy");
      return;
    }
    setSaving(true);
    try {
      const saved = policy ? await updatePolicy(token, policy.id, form) : await createPolicy(token, form);
      toast.success(policy ? "Policy updated" : "Policy created");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{policy ? "Edit policy" : "New policy"}</DialogTitle>
          <DialogDescription>
            Define what to detect, where to look, and what happens on a match.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="policy-name">Name</Label>
            <Input
              id="policy-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Credit card; file scan"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="policy-description">Description</Label>
            <Textarea
              id="policy-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Data type</Label>
              <Select value={form.data_type} onValueChange={(v) => setDataType(v as DataType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>On match</Label>
              <Select
                value={form.action}
                onValueChange={(v) => setForm((f) => ({ ...f, action: v as Action }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="log">Log only</SelectItem>
                  <SelectItem value="flag">Flag for review</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.data_type === "edm_dataset" && (
            <div className="flex flex-col gap-1.5">
              <Label>Dataset</Label>
              {edmDatasets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No EDM datasets yet; create one on the Fingerprints page first.
                </p>
              ) : (
                <Select
                  value={form.edm_dataset_id ?? undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, edm_dataset_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {edmDatasets.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.value_count} values)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {form.data_type === "fingerprint_doc" && (
            <div className="flex flex-col gap-1.5">
              <Label>Document</Label>
              {fingerprints.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No document fingerprints yet; create one on the Fingerprints page first.
                </p>
              ) : (
                <Select
                  value={form.fingerprint_dataset_id ?? undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, fingerprint_dataset_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a document" />
                  </SelectTrigger>
                  <SelectContent>
                    {fingerprints.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_CHANNELS.map((channel) => {
                const active = form.channels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toggleChannel(channel)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {channel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Simulate mode</p>
              <p className="text-xs text-muted-foreground">
                Log matches without blocking, even if the action above is Block.
              </p>
            </div>
            <Switch
              checked={form.simulate_mode}
              onCheckedChange={(v) => setForm((f) => ({ ...f, simulate_mode: v }))}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Enabled</p>
              <p className="text-xs text-muted-foreground">Disabled policies are never evaluated.</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Eye className="size-3.5" />
              Simulate against logged history
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              {previewCount === 0
                ? "No previously logged incidents fall on these channels yet."
                : `This policy's channels would have caught ${previewCount} of the incidents already logged by agents in simulate mode.`}
              {" "}A fuller historical replay across raw content is a future enhancement, not implemented here.
            </p>
            {preview.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {preview.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{i.channel}</span>
                    <RedactedSnippet value={i.redacted_snippet} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : policy ? "Save changes" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
