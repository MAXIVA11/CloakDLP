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

  function scanValue(value) {
    if (!value || value.length < 13) return;
    let match;
    CANDIDATE_RE.lastIndex = 0;
    while ((match = CANDIDATE_RE.exec(value)) !== null) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) continue;
      if (!luhnValid(digits)) continue;

      const redacted = redactKeepLast4(digits);
      if (reportedThisPage.has(redacted)) continue;
      reportedThisPage.add(redacted);

      chrome.runtime.sendMessage({
        type: "card-entry-detected",
        redactedSnippet: redacted,
        domain: window.location.hostname,
        pageUrl: window.location.origin + window.location.pathname,
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
  // the same way a real keystroke would; a submit-time sweep catches those too.
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      for (const el of form.elements) {
        if (isTextLikeInput(el)) scanValue(el.value);
      }
    },
    { capture: true, passive: true },
  );
})();
