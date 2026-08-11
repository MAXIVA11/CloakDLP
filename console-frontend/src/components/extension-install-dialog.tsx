"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extensionDownloadUrl } from "@/lib/api";
import { detectBrowser } from "@/lib/browser-detect";

export function ExtensionInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const browser = detectBrowser();
  const [copied, setCopied] = useState(false);

  async function copyExtensionsUrl() {
    try {
      await navigator.clipboard.writeText(browser.extensionsUrl);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy; select and copy the address manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Install the browser extension</DialogTitle>
          <DialogDescription>
            Detected browser: <span className="font-medium text-foreground">{browser.name}</span>.
            It isn&apos;t published to an extension store yet, so this takes a few clicks instead
            of one. Browsers don&apos;t let a web page open your extensions page directly, so
            you&apos;ll paste that address in yourself.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex gap-3">
            <StepNumber n={1} />
            <div className="flex-1">
              <p className="font-medium">Download the extension</p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <a href={extensionDownloadUrl} download="CloakDLP-browser-extension.zip">
                  <Download className="size-3.5" />
                  Download .zip
                </a>
              </Button>
            </div>
          </li>

          <li className="flex gap-3">
            <StepNumber n={2} />
            <p className="flex-1 pt-0.5">
              Right-click the downloaded file and choose <span className="font-medium">Extract All</span>{" "}
              (or double-click it on Mac) to turn it into a folder. Save that folder somewhere
              you&apos;ll remember, like Documents.
            </p>
          </li>

          <li className="flex gap-3">
            <StepNumber n={3} />
            <div className="flex-1">
              <p>
                Open a new tab and paste this address in, then press{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">Enter</kbd>:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-md border bg-muted px-2 py-1 font-mono text-xs">
                  {browser.extensionsUrl}
                </code>
                <button
                  aria-label="Copy address"
                  onClick={copyExtensionsUrl}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                </button>
              </div>
            </div>
          </li>

          <li className="flex gap-3">
            <StepNumber n={4} />
            <p className="flex-1 pt-0.5">
              Turn on <span className="font-medium">Developer mode</span> (top right of that page).
            </p>
          </li>

          <li className="flex gap-3">
            <StepNumber n={5} />
            <p className="flex-1 pt-0.5">
              Click <span className="font-medium">Load unpacked</span> and upload the folder you
              extracted in step 2.
            </p>
          </li>
        </ol>

        <p className="text-xs text-muted-foreground">
          This manual step goes away once CloakDLP is published to the Chrome Web Store / Edge
          Add-ons; installing will be a single click from here, same as any other extension.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
      {n}
    </span>
  );
}
