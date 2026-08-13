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
  const creds = {
    agentId: data.id,
    apiKey: data.api_key,
    policyId: data.default_credit_card_policy_id ?? null,
    passwordPolicyId: data.default_password_policy_id ?? null,
  };
  await chrome.storage.local.set(creds);
  return creds;
}

async function getCredentials() {
  const stored = await chrome.storage.local.get(["agentId", "apiKey", "policyId", "passwordPolicyId"]);
  // policyId alone is not a sign of being unpaired: heartbeat() below can legitimately set it to
  // null (the console currently has no enabled credit-card policy at all), and treating that as
  // "not paired yet" would re-self-register on every single incident report from then on,
  // needlessly reissuing a fresh API key each time. Only agentId/apiKey being present means
  // pairing has actually happened.
  if (stored.agentId && stored.apiKey) return stored;
  return selfRegister();
}

// The console's Agents view derives online/offline from heartbeat recency (10-minute window on
// the server), the same signal the native agent gives it; so the extension needs to keep
// sending one too, not just once at startup. MV3 service workers get killed when idle and
// setInterval doesn't survive that, so chrome.alarms (which wakes the worker up even after it's
// been unloaded) is the only reliable way to do this periodically instead of just on
// browser/extension startup.
const HEARTBEAT_ALARM = "cloakdlp-heartbeat";

async function postHeartbeat(creds) {
  return fetch(`${CONSOLE_URL}/api/agents/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Id": creds.agentId,
      "X-Api-Key": creds.apiKey,
    },
    body: JSON.stringify({ policy_version: "extension-v1" }),
  });
}

async function heartbeat() {
  try {
    let creds = await getCredentials();
    let res = await postHeartbeat(creds);

    if (res.status === 401) {
      // Stored credentials no longer valid (e.g. the console's database was reset); re-pair once.
      // Mirrors the same recovery already done in reportIncident()/checkPasswordRisk() below -
      // without it, a stale pairing left heartbeat() silently failing every 5 minutes forever,
      // since this was the one caller that never re-registered.
      await chrome.storage.local.remove(["agentId", "apiKey", "policyId", "passwordPolicyId"]);
      creds = await selfRegister();
      res = await postHeartbeat(creds);
    }
    if (!res.ok) return;

    // Self-register only ever runs once, at first pairing; without this, a policy change made
    // in the console later (disabled, replaced, edited) would never reach an already-paired
    // extension - it would keep reporting against whatever policy id it happened to cache that
    // first time, forever. Every heartbeat carries the console's current answer instead, so
    // this converges within one heartbeat interval (currently 5 minutes) of any policy change.
    const data = await res.json();
    const newPolicyId = data.default_credit_card_policy_id ?? null;
    if (newPolicyId !== creds.policyId) {
      await chrome.storage.local.set({ policyId: newPolicyId });
    }
    const newPasswordPolicyId = data.default_password_policy_id ?? null;
    if (newPasswordPolicyId !== creds.passwordPolicyId) {
      await chrome.storage.local.set({ passwordPolicyId: newPasswordPolicyId });
    }
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
      action_taken: "log",
      confidence: 0.95,
      redacted_snippet: redactedSnippet,
      rule_id: "browser-extension-card-entry-v1",
      source_identifier: pageUrl,
    }),
  });
}

// Returns whether the console says to actually block this submission. Fails open (false) on
// every error path - console unreachable, no policy configured, request rejected - matching the
// "best-effort, log only" posture everywhere else in this project. There's no local queue/retry,
// so a console that's down simply means nothing gets blocked or reported for that attempt.
async function reportIncident(redactedSnippet, pageUrl) {
  try {
    let creds = await getCredentials();
    if (!creds.policyId) return false; // console has no enabled credit_card policy; nothing to file against

    let res = await postIncident(creds, redactedSnippet, pageUrl);

    if (res.status === 401) {
      // Stored API key no longer valid (e.g. the console's database was reset); re-pair once.
      await chrome.storage.local.remove(["agentId", "apiKey", "policyId"]);
      creds = await selfRegister();
      if (!creds.policyId) return false;
      res = await postIncident(creds, redactedSnippet, pageUrl);
    }

    if (!res.ok) {
      console.error(`[CloakDLP] incident report failed: HTTP ${res.status}`);
      return false;
    }

    const data = await res.json();
    return data.blocked === true;
  } catch (err) {
    // Most likely cause: the console isn't running.
    console.error("[CloakDLP] couldn't reach the console:", err);
    return false;
  }
}

// Proactive site-risk warning: unlike reportIncident() above, this never touches a card number
// at all - it's a plain domain lookup, fired by content.js on every top-frame navigation, before
// the user has typed anything. Reuses the same score_domain() the console already runs at
// incident time (URLhaus + WHOIS age), just exposed as a standalone check.
async function checkSiteRisk(domain) {
  try {
    const creds = await getCredentials();
    const res = await fetch(`${CONSOLE_URL}/api/risk/check?domain=${encodeURIComponent(domain)}`, {
      headers: { "X-Agent-Id": creds.agentId, "X-Api-Key": creds.apiKey },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Console not running, or the extension isn't paired yet; fail open (no warning) rather
    // than block the page load on this, matching the fail-open posture used everywhere else.
    return null;
  }
}

async function postPasswordIncident(creds, pageUrl) {
  return fetch(`${CONSOLE_URL}/api/incidents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Id": creds.agentId,
      "X-Api-Key": creds.apiKey,
    },
    body: JSON.stringify({
      policy_id: creds.passwordPolicyId,
      channel: "network",
      action_taken: "log",
      confidence: 1.0,
      // Never the password itself, or any fragment derived from it - there's no safe partial
      // representation the way a card's last-4 digits are. Only the fact that a password field
      // was submitted is ever recorded.
      redacted_snippet: "[password - not recorded]",
      rule_id: "browser-extension-password-entry-v1",
      source_identifier: pageUrl,
    }),
  });
}

// Fires only when a password field was actually submitted (content.js's job to determine that),
// and only escalates to an incident report at all if the domain already scores "high" - unlike
// card detection, which reports every single match unconditionally, reporting every login on
// every site would be enormous noise for something that happens on nearly every page visit.
async function checkPasswordRisk(domain, pageUrl) {
  const risk = await checkSiteRisk(domain);
  if (!risk || risk.level !== "high") return { blocked: false };

  try {
    let creds = await getCredentials();
    if (!creds.passwordPolicyId) return { blocked: false, reason: risk.reason };

    let res = await postPasswordIncident(creds, pageUrl);
    if (res.status === 401) {
      await chrome.storage.local.remove(["agentId", "apiKey", "policyId", "passwordPolicyId"]);
      creds = await selfRegister();
      if (!creds.passwordPolicyId) return { blocked: false, reason: risk.reason };
      res = await postPasswordIncident(creds, pageUrl);
    }
    if (!res.ok) return { blocked: false, reason: risk.reason };

    const data = await res.json();
    return { blocked: data.blocked === true, reason: risk.reason };
  } catch {
    return { blocked: false, reason: risk.reason };
  }
}

// chrome.storage.session survives navigations within the same browser session but clears on
// browser restart - exactly the lifetime wanted for "don't nag about the same site again after
// the user has already seen and dismissed the warning once."
function dismissedKey(domain) {
  return `dismissed:${domain}`;
}

async function isDismissed(domain) {
  const stored = await chrome.storage.session.get(dismissedKey(domain));
  return stored[dismissedKey(domain)] === true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "card-entry-detected") {
    // Fire-and-forget: reported while typing, purely for visibility, no submission to hold up.
    reportIncident(message.redactedSnippet, message.pageUrl);
    return false;
  }
  if (message?.type === "card-entry-submit-check") {
    // content.js has already preventDefault()'d the real submit and is waiting on this answer
    // before deciding whether to let it through; `return true` keeps the message channel open
    // for the async sendResponse below (MV3 service workers can't just return a value here).
    reportIncident(message.redactedSnippet, message.pageUrl).then((blocked) => sendResponse({ blocked }));
    return true;
  }
  if (message?.type === "check-site-risk") {
    (async () => {
      if (await isDismissed(message.domain)) {
        sendResponse({ warn: false });
        return;
      }
      const result = await checkSiteRisk(message.domain);
      // Only "high" surfaces a warning - "medium"/"low"/"unknown" all stay silent. Domain age is
      // a coarse signal (a brand-new legitimate small business looks identical to a brand-new
      // scam domain under this heuristic), so this only interrupts the page for either an actual
      // URLhaus listing or a domain young enough that the false-positive rate is worth it.
      sendResponse(result && result.level === "high" ? { warn: true, reason: result.reason } : { warn: false });
    })();
    return true;
  }
  if (message?.type === "dismiss-site-warning") {
    chrome.storage.session.set({ [dismissedKey(message.domain)]: true });
    return false;
  }
  if (message?.type === "check-password-risk") {
    // Deliberately NOT gated by isDismissed() - dismissing the passive top-of-page banner means
    // "I saw the warning," not "I consent to entering my password here." The two are independent.
    checkPasswordRisk(message.domain, message.pageUrl).then(sendResponse);
    return true;
  }
});
