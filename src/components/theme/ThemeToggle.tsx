"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getStore, saveStore } from "@/lib/store";
import {
  applyEffectiveThemeToDocument,
  resolveThemePreference,
  type EffectiveTheme,
  type ThemePreference,
} from "@/lib/themePreference";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/components/ui/cn";

type Props = {
  className?: string;
};

export function ThemeToggle({ className }: Props) {
  const [stored, setStored] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? "system" : (getStore().preferences?.theme ?? "system"),
  );
  const [effective, setEffective] = useState<EffectiveTheme>(() =>
    typeof window === "undefined" ? "light" : resolveThemePreference(getStore().preferences?.theme),
  );

  useEffect(() => {
    const eff = resolveThemePreference(stored);
    setEffective(eff);
    applyEffectiveThemeToDocument(eff);
  }, [stored]);

  function toggle() {
    const nextEffective: EffectiveTheme = effective === "dark" ? "light" : "dark";
    setStored(nextEffective);
    setEffective(nextEffective);
    applyEffectiveThemeToDocument(nextEffective);
    const store = getStore();
    store.preferences.theme = nextEffective;
    saveStore(store);
  }

  const ariaLabel =
    stored === "system"
      ? effective === "dark"
        ? "Switch to light mode (saves your preference)"
        : "Switch to dark mode (saves your preference)"
      : effective === "dark"
        ? "Switch to light mode"
        : "Switch to dark mode";

  return (
    <Button
      onClick={toggle}
      variant="ghost"
      className={cn("gap-0 px-2.5 py-2 min-w-9", className)}
      type="button"
      aria-label={ariaLabel}
    >
      {effective === "dark" ? <Sun className="h-4 w-4 shrink-0" aria-hidden /> : <Moon className="h-4 w-4 shrink-0" aria-hidden />}
    </Button>
  );
}
