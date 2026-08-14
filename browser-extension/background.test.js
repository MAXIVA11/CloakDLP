// Regression tests for background.js's stale-pairing recovery. Both bugs covered here shipped
// and were live for a while before being caught by manual testing, not by any automated check -
// these exist so a future edit that removes the 401-retry from heartbeat() or checkSiteRisk()
// fails a test instead of silently shipping. Run with `node --test` (Node 18+, no dependencies).

"use strict";

const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");

function makeChromeMock() {
  const local = {};
  const session = {};
  return {
    storage: {
      local: {
        async get(keys) {
          const result = {};
          for (const k of keys) if (k in local) result[k] = local[k];
          return result;
        },
        async set(obj) {
          Object.assign(local, obj);
        },
        async remove(keys) {
          for (const k of keys) delete local[k];
        },
      },
      session: {
        async get(key) {
          return key in session ? { [key]: session[key] } : {};
        },
        async set(obj) {
          Object.assign(session, obj);
        },
      },
    },
    runtime: {
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
    },
    alarms: {
      create() {},
      onAlarm: { addListener() {} },
    },
    // Test-only escape hatch to seed/inspect storage directly; not part of the real chrome API.
    _local: local,
  };
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

let chromeMock;
let fetchCalls;
let fetchQueue;
let bg;

beforeEach(() => {
  chromeMock = makeChromeMock();
  global.chrome = chromeMock;
  // Node 21+ ships its own read-only `navigator` global; a plain assignment throws.
  Object.defineProperty(global, "navigator", {
    value: { userAgent: "Mozilla/5.0 Chrome/120.0 Test" },
    configurable: true,
  });

  fetchCalls = [];
  fetchQueue = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    const next = fetchQueue.shift();
    if (!next) throw new Error(`fetch("${url}") called more times than the test queued responses for`);
    return next;
  };

  delete require.cache[require.resolve("./background.js")];
  bg = require("./background.js");
});

test("heartbeat() recovers from a 401 by re-registering and retrying", async () => {
  chromeMock._local.agentId = "stale-agent";
  chromeMock._local.apiKey = "stale-key";

  fetchQueue.push(jsonResponse(401, {}));
  fetchQueue.push(
    jsonResponse(200, {
      id: "fresh-agent",
      api_key: "fresh-key",
      default_credit_card_policy_id: "new-policy",
      default_password_policy_id: "new-password-policy",
    }),
  );
  fetchQueue.push(
    jsonResponse(200, {
      default_credit_card_policy_id: "new-policy",
      default_password_policy_id: "new-password-policy",
    }),
  );

  await bg.heartbeat();

  assert.equal(fetchCalls.length, 3, "expected: heartbeat (401), self-register, heartbeat retry");
  assert.match(fetchCalls[0].url, /\/api\/agents\/heartbeat$/);
  assert.equal(fetchCalls[0].opts.headers["X-Api-Key"], "stale-key");
  assert.match(fetchCalls[1].url, /\/api\/agents\/self-register$/);
  assert.match(fetchCalls[2].url, /\/api\/agents\/heartbeat$/);
  assert.equal(fetchCalls[2].opts.headers["X-Api-Key"], "fresh-key", "retry must use the newly issued key, not the stale one");

  assert.equal(chromeMock._local.agentId, "fresh-agent");
  assert.equal(chromeMock._local.apiKey, "fresh-key");
});

test("heartbeat() does not retry when the first attempt already succeeds", async () => {
  chromeMock._local.agentId = "agent-1";
  chromeMock._local.apiKey = "key-1";

  fetchQueue.push(
    jsonResponse(200, {
      default_credit_card_policy_id: "policy-a",
      default_password_policy_id: "policy-b",
    }),
  );

  await bg.heartbeat();

  assert.equal(fetchCalls.length, 1);
  assert.equal(chromeMock._local.agentId, "agent-1", "no re-registration should have happened");
  assert.equal(chromeMock._local.policyId, "policy-a");
  assert.equal(chromeMock._local.passwordPolicyId, "policy-b");
});

test("checkSiteRisk() recovers from a 401 by re-registering and retrying", async () => {
  chromeMock._local.agentId = "stale-agent";
  chromeMock._local.apiKey = "stale-key";

  fetchQueue.push(jsonResponse(401, {}));
  fetchQueue.push(
    jsonResponse(200, {
      id: "fresh-agent",
      api_key: "fresh-key",
      default_credit_card_policy_id: null,
      default_password_policy_id: null,
    }),
  );
  fetchQueue.push(jsonResponse(200, { score: 100, level: "high", reason: "listed on the URLhaus malware/phishing blocklist" }));

  const result = await bg.checkSiteRisk("risky-example.test");

  assert.equal(fetchCalls.length, 3, "expected: risk check (401), self-register, risk check retry");
  assert.match(fetchCalls[0].url, /\/api\/risk\/check\?domain=/);
  assert.equal(fetchCalls[0].opts.headers["X-Api-Key"], "stale-key");
  assert.match(fetchCalls[1].url, /\/api\/agents\/self-register$/);
  assert.equal(fetchCalls[2].opts.headers["X-Api-Key"], "fresh-key", "retry must use the newly issued key, not the stale one");

  assert.deepEqual(result, { score: 100, level: "high", reason: "listed on the URLhaus malware/phishing blocklist" });
  assert.equal(chromeMock._local.agentId, "fresh-agent");
});

test("checkSiteRisk() fails open (returns null) if the retried request also fails", async () => {
  chromeMock._local.agentId = "stale-agent";
  chromeMock._local.apiKey = "stale-key";

  fetchQueue.push(jsonResponse(401, {}));
  fetchQueue.push(jsonResponse(200, { id: "fresh-agent", api_key: "fresh-key" }));
  fetchQueue.push(jsonResponse(500, {}));

  const result = await bg.checkSiteRisk("example.test");

  assert.equal(result, null);
});

test("checkSiteRisk() does not retry when the first attempt already succeeds", async () => {
  chromeMock._local.agentId = "agent-1";
  chromeMock._local.apiKey = "key-1";

  fetchQueue.push(jsonResponse(200, { score: 10, level: "low", reason: "established domain" }));

  const result = await bg.checkSiteRisk("example.test");

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(result, { score: 10, level: "low", reason: "established domain" });
});
