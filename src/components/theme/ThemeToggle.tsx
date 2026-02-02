"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getStore, saveStore } from "@/lib/store";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.body.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const store = getStore();
    const initial = store.preferences?.theme ?? "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    document.documentElement.dataset.theme = next;
    document.body.dataset.theme = next;
    const store = getStore();
    store.preferences.theme = next;
    saveStore(store);
  }

  return (
    <Button onClick={toggle} variant="ghost" className="gap-2">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {theme === "dark" ? "Switch to light" : "Switch to dark"}
    </Button>
  );
}
