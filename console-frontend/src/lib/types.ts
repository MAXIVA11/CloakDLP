export type Channel = "file" | "clipboard" | "print" | "network";
export type Action = "block" | "flag" | "log";
export type DetectionMethod = "regex" | "edm" | "fingerprint";
export type DataType =
  | "credit_card"
  | "ssn"
  | "api_key"
  | "private_key"
  | "edm_dataset"
  | "fingerprint_doc";
export type IncidentStatus = "open" | "false_positive" | "resolved";
export type AgentStatus = "online" | "offline";

export interface Policy {
  id: string;
  name: string;
  description: string;
  data_type: DataType;
  detection_method: DetectionMethod;
  channels: Channel[];
  action: Action;
  target_scope: Record<string, unknown>;
  enabled: boolean;
  simulate_mode: boolean;
  edm_dataset_id: string | null;
  fingerprint_dataset_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PolicyInput = Omit<Policy, "id" | "created_at" | "updated_at">;

export interface Incident {
  id: string;
  policy_id: string;
  agent_id: string;
  channel: Channel;
  action_taken: Action;
  confidence: number;
  redacted_snippet: string;
  rule_id: string;
  source_identifier: string;
  status: IncidentStatus;
  timestamp: string;
  extra: Record<string, unknown>;
}

export interface Agent {
  id: string;
  hostname: string;
  status: AgentStatus;
  policy_version: string;
  last_heartbeat: string | null;
}

export interface DashboardStats {
  blocked_today: number;
  flagged_today: number;
  logged_today: number;
  active_policies: number;
  agents_online: number;
  agents_total: number;
  false_positive_rate: number;
  channel_breakdown: { channel: Channel; count: number }[];
}

export interface CurrentUser {
  id: string;
  email: string;
  created_at: string;
}

export type EdmFieldType = "email" | "number";

export interface EdmDataset {
  id: string;
  name: string;
  field_type: EdmFieldType;
  value_count: number;
  created_at: string;
}

export interface FingerprintDataset {
  id: string;
  name: string;
  source_filename: string;
  created_at: string;
}
