// Pairs with the local console exactly the way the .NET agent does (self-register over
// loopback, no manual API key entry) and forwards redacted card-entry events content.js finds.
// This service worker never sees the actual card digits; content.js already redacted before
// sending the message.

const CONSOLE_URL = "http://127.0.0.1:8123";

function detectBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  return "Browser";
}

async function selfRegister() {
  const hostname = `Browser Extension (${detectBrowserName()})`;
  const res = await fetch(`${CONSOLE_URL}/api/agents/self-register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostname, kind: "browser_extension" }),
  });
  if (!res.ok) throw new Error(`self-register failed: HTTP ${res.status}`);

  const data = await res.json();
  const creds = { agentId: data.id, apiKey: data.api_key, policyId: data.default_credit_card_policy_id ?? null };
  await chrome.storage.local.set(creds);
  return creds;
}

async function getCredentials() {
  const stored = await chrome.storage.local.get(["agentId", "apiKey", "policyId"]);
  if (stored.agentId && stored.apiKey && stored.policyId) return stored;
  return selfRegister();
}

// The console's Agents view derives online/offline from heartbeat recency (10-minute window on
// the server), the same signal the native agent gives it; so the extension needs to keep
// sending one too, not just once at startup. MV3 service workers get killed when idle and
// setInterval doesn't survive that, so chrome.alarms (which wakes the worker up even after it's
// been unloaded) is the only reliable way to do this periodically instead of just on
// browser/extension startup.
const HEARTBEAT_ALARM = "cloakdlp-heartbeat";

async function heartbeat() {
  try {
    const creds = await getCredentials();
    await fetch(`${CONSOLE_URL}/api/agents/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": creds.agentId,
        "X-Api-Key": creds.apiKey,
      },
      body: JSON.stringify({ policy_version: "extension-v1" }),
    });
  } catch {
    // console not running yet; fine, we'll try again next alarm or the next card detection
  }
}

function armHeartbeatAlarm() {
  heartbeat();
  // Re-creating an alarm that already exists just resets its schedule; harmless, and cheap
  // insurance against the alarm ever having been cleared.
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 5 });
}

chrome.runtime.onStartup.addListener(armHeartbeatAlarm);
chrome.runtime.onInstalled.addListener(armHeartbeatAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) heartbeat();
});

async function postIncident(creds, redactedSnippet, pageUrl) {
  return fetch(`${CONSOLE_URL}/api/incidents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Id": creds.agentId,
      "X-Api-Key": creds.apiKey,
    },
    body: JSON.stringify({
      policy_id: creds.policyId,
      channel: "network",
      action_taken: "flag",
      confidence: 0.95,
      redacted_snippet: redactedSnippet,
      rule_id: "browser-extension-card-entry-v1",
      source_identifier: pageUrl,
    }),
  });
}

async function reportIncident(redactedSnippet, pageUrl) {
  try {
    let creds = await getCredentials();
    if (!creds.policyId) return; // console has no enabled credit_card policy; nothing to file against

    let res = await postIncident(creds, redactedSnippet, pageUrl);

    if (res.status === 401) {
      // Stored API key no longer valid (e.g. the console's database was reset); re-pair once.
      await chrome.storage.local.remove(["agentId", "apiKey", "policyId"]);
      creds = await selfRegister();
      if (!creds.policyId) return;
      res = await postIncident(creds, redactedSnippet, pageUrl);
    }

    if (!res.ok) {
      console.error(`[CloakDLP] incident report failed: HTTP ${res.status}`);
    }
  } catch (err) {
    // Most likely cause: the console isn't running. Nothing useful to do but drop it; there's
    // no local queue/retry, matching the "log only, best-effort" posture everywhere else.
    console.error("[CloakDLP] couldn't reach the console:", err);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "card-entry-detected") {
    reportIncident(message.redactedSnippet, message.pageUrl);
  }
});
