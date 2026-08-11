export type BrowserId = "brave" | "edge" | "chrome" | "other";

export interface BrowserInfo {
  id: BrowserId;
  name: string;
  extensionsUrl: string;
}

const BROWSER_INFO: Record<BrowserId, BrowserInfo> = {
  brave: { id: "brave", name: "Brave", extensionsUrl: "brave://extensions" },
  edge: { id: "edge", name: "Edge", extensionsUrl: "edge://extensions" },
  chrome: { id: "chrome", name: "Chrome", extensionsUrl: "chrome://extensions" },
  other: { id: "other", name: "your browser", extensionsUrl: "chrome://extensions" },
};

// Brave deliberately keeps a Chrome-identical user agent for site-compatibility reasons, so UA
// sniffing can't tell it apart; but it exposes navigator.brave for exactly this purpose.
// (.isBrave() is async and always resolves true when present; the object's mere existence is
// the synchronous signal every "is this Brave" community pattern actually relies on.)
export function detectBrowser(): BrowserInfo {
  if (typeof navigator === "undefined") return BROWSER_INFO.other;
  if ("brave" in navigator) return BROWSER_INFO.brave;
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return BROWSER_INFO.edge;
  if (ua.includes("Chrome/")) return BROWSER_INFO.chrome;
  return BROWSER_INFO.other;
}
