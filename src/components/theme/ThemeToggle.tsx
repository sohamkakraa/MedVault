"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { getStore, saveStore } from "@/lib/store";
import {
  applyEffectiveThemeToDocument,
  readEffectiveThemeFromDocument,
  resolveThemePreference,
  type EffectiveTheme,
  type ThemePreference,
} from "@/lib/themePreference";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/components/ui/cn";

type Props = {
  className?: string;
};

type ThemeSnap = { stored: ThemePreference; effective: EffectiveTheme };

const SERVER_SNAP_JSON = JSON.stringify({
  stored: "system",
  effective: "light",
} satisfies ThemeSnap);

function computeThemeSnap(): ThemeSnap {
  const store = getStore();
  const pref = (store.preferences?.theme ?? "system") as ThemePreference;
  const fromHtml = readEffectiveThemeFromDocument();
  const effective = fromHtml ?? resolveThemePreference(pref);
  return { stored: pref, effective };
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("mv-store-update", onChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("mv-store-update", onChange);
    mq.removeEventListener("change", onChange);
  };
}

function getThemeSnapJson(): string {
  return JSON.stringify(computeThemeSnap());
}

export function ThemeToggle({ className }: Props) {
  const raw = useSyncExternalStore(subscribe, getThemeSnapJson, () => SERVER_SNAP_JSON);
  const { stored, effective } = JSON.parse(raw) as ThemeSnap;

  function toggle() {
    const nextEffective: EffectiveTheme = effective === "dark" ? "light" : "dark";
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
