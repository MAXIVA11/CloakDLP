"use client";

import {
  Fingerprint,
  LayoutDashboard,
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

const navGroups = [
  {
    label: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/incidents", label: "Incidents", icon: ShieldAlert },
    ],
  },
  {
    label: "Protect",
    items: [
      { href: "/policies", label: "Policies", icon: ShieldCheck },
      { href: "/fingerprints", label: "Fingerprints", icon: Fingerprint },
      { href: "/agents", label: "Agents", icon: Server },
    ],
  },
  {
    label: "Reports",
    items: [{ href: "/reports", label: "Reports", icon: ScrollText }],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 pt-4 pb-3">
        <div className="flex items-center gap-2.5 px-1">
          <div className="relative shrink-0">
            <Image src="/logo.png" alt="" width={28} height={28} className="rounded-md" priority />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-sidebar" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold tracking-tight text-white">CloakDLP</span>
            <span className="text-[10px] font-medium tracking-wide text-success/90 uppercase">Protected</span>
          </div>
        </div>
      </SidebarHeader>

      <div className="mx-3 border-t border-white/10" />

      <SidebarContent className="pt-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/45">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="rounded-lg text-sidebar-foreground/85 transition-all duration-150 data-active:bg-primary/15 data-active:font-medium data-active:text-white data-active:shadow-[inset_0_0_0_1px_rgba(53,184,172,0.35),0_2px_14px_-4px_rgba(53,184,172,0.5)]"
                      >
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
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-0 px-3 pb-3">
        <div className="mb-1 border-t border-white/10" />
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
