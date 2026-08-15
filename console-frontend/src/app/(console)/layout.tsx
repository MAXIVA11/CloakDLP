"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { ExtensionInstallBanner } from "@/components/extension-install-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex w-full max-w-md flex-col gap-3 px-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold text-foreground">Console unreachable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            CloakDLP only signs you in automatically when the console is opened on this machine.
            Open it from the Start Menu shortcut or the tray icon instead.
          </p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <ExtensionInstallBanner />
        <div className="flex-1 overflow-auto px-6 py-4">
          <SidebarTrigger className="mb-2" />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
