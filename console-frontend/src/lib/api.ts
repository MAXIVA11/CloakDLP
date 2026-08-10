import type {
  Agent,
  AgentKind,
  CurrentUser,
  DashboardStats,
  EdmDataset,
  EdmFieldType,
  ExtensionStatus,
  FingerprintDataset,
  Incident,
  IncidentStatus,
  Policy,
  PolicyInput,
  WorkstationStatus,
} from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8123";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function login(email: string, password: string): Promise<string> {
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await handle<{ access_token: string }>(res);
  return data.access_token;
}

export async function localLogin(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/local-login`, { method: "POST" });
  const data = await handle<{ access_token: string }>(res);
  return data.access_token;
}

export async function register(email: string, password: string): Promise<CurrentUser> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handle<CurrentUser>(res);
}

export async function getCurrentUser(token: string): Promise<CurrentUser> {
  const res = await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders(token) });
  return handle<CurrentUser>(res);
}

export async function listPolicies(token: string): Promise<Policy[]> {
  const res = await fetch(`${API_URL}/api/policies`, { headers: authHeaders(token) });
  return handle<Policy[]>(res);
}

export async function createPolicy(token: string, input: PolicyInput): Promise<Policy> {
  const res = await fetch(`${API_URL}/api/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(input),
  });
  return handle<Policy>(res);
}

export async function updatePolicy(
  token: string,
  id: string,
  input: Partial<PolicyInput>,
): Promise<Policy> {
  const res = await fetch(`${API_URL}/api/policies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(input),
  });
  return handle<Policy>(res);
}

export async function deletePolicy(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/policies/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handle<void>(res);
}

export async function listIncidents(
  token: string,
  params?: { channel?: string; status?: string },
): Promise<Incident[]> {
  const query = new URLSearchParams();
  if (params?.channel) query.set("channel", params.channel);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  const res = await fetch(`${API_URL}/api/incidents${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(token),
  });
  return handle<Incident[]>(res);
}

export async function updateIncidentStatus(
  token: string,
  id: string,
  status: IncidentStatus,
): Promise<Incident> {
  const res = await fetch(`${API_URL}/api/incidents/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ status }),
  });
  return handle<Incident>(res);
}

export async function listAgents(token: string): Promise<Agent[]> {
  const res = await fetch(`${API_URL}/api/agents`, { headers: authHeaders(token) });
  return handle<Agent[]>(res);
}

export async function deleteAgent(token: string, agentId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/agents/${agentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await handle<void>(res);
}

export async function registerAgent(
  token: string,
  hostname: string,
  kind: AgentKind = "native",
): Promise<{ id: string; hostname: string; api_key: string }> {
  const res = await fetch(`${API_URL}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ hostname, kind }),
  });
  return handle(res);
}

export async function getExtensionStatus(token: string): Promise<ExtensionStatus> {
  const res = await fetch(`${API_URL}/api/agents/extension-status`, { headers: authHeaders(token) });
  return handle<ExtensionStatus>(res);
}

export async function getWorkstationStatus(token: string): Promise<WorkstationStatus> {
  const res = await fetch(`${API_URL}/api/agents/workstation`, { headers: authHeaders(token) });
  return handle<WorkstationStatus>(res);
}

export async function listEdmDatasets(token: string): Promise<EdmDataset[]> {
  const res = await fetch(`${API_URL}/api/edm/datasets`, { headers: authHeaders(token) });
  return handle<EdmDataset[]>(res);
}

export async function createEdmDataset(
  token: string,
  input: { name: string; field_type: EdmFieldType; values: string[] },
): Promise<EdmDataset> {
  const res = await fetch(`${API_URL}/api/edm/datasets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(input),
  });
  return handle<EdmDataset>(res);
}

export async function deleteEdmDataset(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/edm/datasets/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handle<void>(res);
}

export async function listFingerprints(token: string): Promise<FingerprintDataset[]> {
  const res = await fetch(`${API_URL}/api/fingerprints`, { headers: authHeaders(token) });
  return handle<FingerprintDataset[]>(res);
}

export async function createFingerprint(token: string, name: string, file: File): Promise<FingerprintDataset> {
  const form = new FormData();
  form.set("name", name);
  form.set("file", file);
  const res = await fetch(`${API_URL}/api/fingerprints`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  return handle<FingerprintDataset>(res);
}

export async function deleteFingerprint(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/fingerprints/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handle<void>(res);
}

export async function getDashboardStats(token: string): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/dashboard/stats`, { headers: authHeaders(token) });
  return handle<DashboardStats>(res);
}

export function incidentsWebSocketUrl(token: string): string {
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/incidents?token=${encodeURIComponent(token)}`;
}
