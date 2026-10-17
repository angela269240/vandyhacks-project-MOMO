"use client";

import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { setTheme, useTheme } from "@/hooks/useTheme";

/** Little switch in the upper right: on = white mode. */
export function ThemeSwitch() {
  const theme = useTheme();
  return (
    <label className="glass flex h-9 items-center gap-1.5 rounded-full px-2.5 text-muted-foreground">
      <Moon className="size-3.5" aria-hidden />
      <Switch
        checked={theme === "light"}
        onCheckedChange={(on) => setTheme(on ? "light" : "dark")}
        aria-label="White mode"
      />
      <Sun className="size-3.5" aria-hidden />
    </label>
  );
}
