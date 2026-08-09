"use client";

import {
  Fingerprint,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/policies", label: "Policies", icon: ShieldCheck },
  { href: "/incidents", label: "Incidents", icon: ShieldAlert },
  { href: "/fingerprints", label: "Fingerprints", icon: Fingerprint },
  { href: "/agents", label: "Agents", icon: Server },
  { href: "/reports", label: "Reports", icon: ScrollText },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 px-1">
          <Image src="/logo.png" alt="" width={26} height={26} className="shrink-0" priority />
          <span className="font-mono text-sm font-semibold tracking-tight">CloakDLP</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 px-3 pb-4">
        <div className="flex items-center justify-between rounded-md border border-sidebar-border px-2.5 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{user?.email}</span>
            <span className="text-[11px] text-muted-foreground">Signed in</span>
          </div>
          <div className="flex items-center">
            <ThemeToggle />
            <SidebarMenuButton
              onClick={logout}
              tooltip="Sign out"
              className="size-8 shrink-0 justify-center p-0"
            >
              <LogOut />
            </SidebarMenuButton>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
