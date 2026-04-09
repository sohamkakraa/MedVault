"use client";

import { useEffect } from "react";
import { getStore } from "@/lib/store";
import {
  applyEffectiveThemeToDocument,
  resolveThemePreference,
  type ThemePreference,
} from "@/lib/themePreference";

export function ThemeInit() {
  useEffect(() => {
    const store = getStore();
    const pref = (store.preferences?.theme ?? "system") as ThemePreference;
    const effective = resolveThemePreference(pref);
    applyEffectiveThemeToDocument(effective);

    if (pref !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = () => {
      const s = getStore();
      const p = (s.preferences?.theme ?? "system") as ThemePreference;
      if (p !== "system") return;
      applyEffectiveThemeToDocument(resolveThemePreference("system"));
    };
    mq.addEventListener("change", onOsChange);
    return () => mq.removeEventListener("change", onOsChange);
  }, []);

  return null;
}
