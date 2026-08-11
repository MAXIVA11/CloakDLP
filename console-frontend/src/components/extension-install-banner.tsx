"use client";

import { Puzzle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ExtensionInstallDialog } from "@/components/extension-install-dialog";
import { getExtensionStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ExtensionStatus } from "@/lib/types";

export function ExtensionInstallBanner() {
  const { token } = useAuth();
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    getExtensionStatus(token).then(setStatus).catch(() => {});
  }, [token]);

  // Re-shown on every fresh page load / sign-in; dismissing quiets it for this session without
  // permanently losing it, since "catch typed card entry on checkout pages" is a real coverage
  // gap until this is installed.
  if (!status || status.installed || dismissed) return null;

  return (
    <>
      <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Puzzle className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install the CloakDLP browser extension</p>
          <p className="text-xs text-muted-foreground">
            Catches card numbers typed directly into checkout pages; the desktop agent alone only
            sees copy-paste and plain-HTTP traffic.
          </p>
        </div>
        {status.store_url ? (
          <Button asChild size="sm" className="shrink-0">
            <a href={status.store_url} target="_blank" rel="noopener noreferrer">
              Install extension
            </a>
          </Button>
        ) : (
          <Button size="sm" className="shrink-0" onClick={() => setInstallDialogOpen(true)}>
            Install extension
          </Button>
        )}
        <button
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <ExtensionInstallDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
    </>
  );
}
