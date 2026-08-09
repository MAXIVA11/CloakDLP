import { Fingerprint } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function FingerprintsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Fingerprints"
        description="Exact data match datasets and document fingerprints used for detection."
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <Fingerprint className="size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Not built yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Exact Data Match (Phase 3) and document fingerprinting via fuzzy hashing (Phase 4)
              land here — reference datasets get salted-hashed locally, raw values never stored.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
