// Watches text-like input fields for a Luhn-valid credit card number as it's typed. Mirrors
// agent/CloakDlp.Agent/Detection/CreditCardDetector.cs (regex candidate -> strip separators ->
// Luhn check) so the two detectors behave identically. Runs in every frame (including
// cross-origin payment iframes like Stripe Elements) since content scripts are injected by the
// browser itself, not subject to the frame's own CSP/CORS the way the page's own JS would be.
//
// Only ever sends a redacted (last-4) snippet plus this frame's domain to the background
// worker; never the actual digits.

(function () {
  "use strict";

  const CANDIDATE_RE = /\b(?:\d[ -]?){13,19}\b/g;
  const reportedThisPage = new Set();

  function luhnValid(digits) {
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48; // '0'
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  }

  function redactKeepLast4(digits) {
    if (digits.length <= 4) return "*".repeat(digits.length);
    return "*".repeat(digits.length - 4) + digits.slice(-4);
  }

  // Pure: returns every Luhn-valid card number found in a string, without side effects. Shared
  // by the input-time (report only) and submit-time (report + maybe block) paths below.
  function findCardNumbers(value) {
    if (!value || value.length < 13) return [];
    const found = [];
    let match;
    CANDIDATE_RE.lastIndex = 0;
    while ((match = CANDIDATE_RE.exec(value)) !== null) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) continue;
      if (!luhnValid(digits)) continue;
      found.push(digits);
    }
    return found;
  }

  function pageUrl() {
    return window.location.origin + window.location.pathname;
  }

  // Fire-and-forget report while the user is still typing; nothing to hold up here, this is
  // purely for visibility (and for catching values on forms that never actually get submitted).
  function scanValue(value) {
    for (const digits of findCardNumbers(value)) {
      const redacted = redactKeepLast4(digits);
      if (reportedThisPage.has(redacted)) continue;
      reportedThisPage.add(redacted);
      chrome.runtime.sendMessage({ type: "card-entry-detected", redactedSnippet: redacted, pageUrl: pageUrl() });
    }
  }

  // Reports the same match again at submit time (yes, a second incident even if this exact
  // value was already reported while typing) because that's the only way to get a fresh,
  // authoritative block/no-block answer from the console - the policy backing it can change at
  // any moment, so nothing about an earlier report is safe to reuse for this decision.
  async function checkShouldBlock(digits) {
    const redacted = redactKeepLast4(digits);
    const response = await chrome.runtime.sendMessage({
      type: "card-entry-submit-check",
      redactedSnippet: redacted,
      pageUrl: pageUrl(),
    });
    return response?.blocked === true;
  }

  function showBlockedWarning() {
    // A card-input iframe (Stripe Elements etc.) is often just a few pixels tall - not a useful
    // place to show a banner even though blocking itself still applies there. Only the top
    // frame is worth decorating.
    if (window.top !== window.self) return;
    const banner = document.createElement("div");
    banner.textContent = "CloakDLP blocked this submission: a credit card number was detected and this policy blocks it.";
    banner.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:8px;" +
      "font:14px/1.4 -apple-system,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);" +
      "max-width:90vw;text-align:center;";
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 6000);
  }

  // Proactive warning, fired once per page load, before the user has typed anything - the whole
  // point being to catch a risky site *before* a card number ever gets entered, not just react
  // after the fact like the input/submit listeners below. Only the top frame checks or shows
  // this; an ad or payment iframe warning about its own (often CDN/tracking) domain would be
  // both noisy and the wrong domain to be warning about anyway.
  function showSiteRiskWarning(reason, domain) {
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:#3a1f00;color:#ffd580;padding:12px 40px 12px 20px;border-radius:8px;" +
      "font:14px/1.4 -apple-system,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);" +
      "max-width:90vw;text-align:left;border:1px solid #7a4a00;";
    banner.textContent = `CloakDLP: this site looks risky (${reason}). Be cautious before entering any personal or payment details.`;

    const closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "position:absolute;top:8px;right:14px;cursor:pointer;font-size:18px;line-height:1;";
    closeBtn.addEventListener("click", () => {
      banner.remove();
      chrome.runtime.sendMessage({ type: "dismiss-site-warning", domain });
    });
    banner.appendChild(closeBtn);
    document.body.appendChild(banner);
  }

  if (window.top === window.self) {
    const domain = window.location.hostname;
    if (domain) {
      chrome.runtime.sendMessage({ type: "check-site-risk", domain }).then((response) => {
        if (response?.warn) showSiteRiskWarning(response.reason, domain);
      });
    }
  }

  function isTextLikeInput(el) {
    if (el instanceof HTMLTextAreaElement) return true;
    if (!(el instanceof HTMLInputElement)) return false;
    return ["text", "tel", "search", ""].includes(el.type);
  }

  document.addEventListener(
    "input",
    (event) => {
      const el = event.target;
      if (isTextLikeInput(el)) scanValue(el.value);
    },
    { capture: true, passive: true },
  );

  // Password managers / autofill often set .value programmatically without firing input events
  // the same way a real keystroke would; a submit-time sweep catches those too - and this is
  // also the actual enforcement point for blocking, since "let it through unless a live policy
  // check says not to" only makes sense right before the data would actually leave.
  //
  // Deliberately NOT passive (unlike the input listener above): a passive listener physically
  // cannot call preventDefault(), so it would be structurally incapable of blocking anything no
  // matter what the policy says. Every matching field's card number gets an async block/no-block
  // answer before the submission is allowed to proceed - preventDefault() fires synchronously,
  // immediately, since that's the only point at which it's still legal to cancel the event; the
  // async decision runs after, and either shows a warning (blocked) or replays the submission
  // via form.submit() (not blocked). form.submit() is used specifically because, unlike
  // form.requestSubmit(), it does not dispatch a new "submit" event - so this replay can't
  // re-trigger this same listener and loop.
  //
  // Known gap: this only ever sees native <form> submissions. A checkout flow that reads field
  // values and calls fetch()/XHR directly, with no <form> or submit event involved at all (common
  // with some JS-heavy payment UIs), has nothing here to intercept - the input-time listener
  // above still reports it, but nothing can block it. Full coverage would mean also patching
  // window.fetch/XMLHttpRequest, a much larger change deliberately left out here.
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const matches = [];
      for (const el of form.elements) {
        if (isTextLikeInput(el)) matches.push(...findCardNumbers(el.value));
      }
      if (matches.length === 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      Promise.all(matches.map(checkShouldBlock))
        .then((results) => {
          if (results.some(Boolean)) {
            showBlockedWarning();
          } else {
            form.submit();
          }
        })
        // e.g. the extension context was invalidated by a reload mid-flight; the submission was
        // already prevented above, so failing open here (rather than swallowing it) is what
        // keeps this consistent with the "best-effort, never silently eats a real submission"
        // posture the rest of the block-decision path relies on.
        .catch(() => form.submit());
    },
    { capture: true },
  );
})();
