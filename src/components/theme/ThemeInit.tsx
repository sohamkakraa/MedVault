"use client";

import { useEffect } from "react";
import { getStore } from "@/lib/store";

export function ThemeInit() {
  useEffect(() => {
    const store = getStore();
    const theme = store.preferences?.theme ?? "dark";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem("mv_theme", theme);
  }, []);

  return null;
}
