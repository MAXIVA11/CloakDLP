"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { SidebarMenuButton } from "@/components/ui/sidebar";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <SidebarMenuButton aria-hidden className="opacity-0" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <SidebarMenuButton
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      {isDark ? <Sun /> : <Moon />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </SidebarMenuButton>
  );
}
