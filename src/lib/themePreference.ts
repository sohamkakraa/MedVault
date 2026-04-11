export type ThemePreference = "dark" | "light" | "system";

/** Resolved appearance for CSS (`data-theme`). */
export type EffectiveTheme = "dark" | "light";

export function resolveThemePreference(pref: ThemePreference | undefined): EffectiveTheme {
  const p = pref ?? "system";
  if (p === "dark" || p === "light") return p;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** After the theme boot script runs, matches painted `data-theme` (avoids SSR/client hydration drift). */
export function readEffectiveThemeFromDocument(): EffectiveTheme | null {
  if (typeof document === "undefined") return null;
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : null;
}

export function applyEffectiveThemeToDocument(effective: EffectiveTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = effective;
  root.style.colorScheme = effective;
  document.body.dataset.theme = effective;
  try {
    localStorage.setItem("mv_theme", effective);
  } catch {
    /* ignore */
  }
}

/**
 * Runs before React hydrates. Reads `preferences.theme` from the patient store JSON; `system` uses OS preference.
 * Only sets &lt;html&gt; (body may not exist yet).
 */
export const THEME_BOOT_SCRIPT = `(function(){
  var d=document.documentElement;
  var pref="system";
  try{
    var raw=localStorage.getItem("mv_patient_store_v1");
    if(raw){
      var j=JSON.parse(raw);
      var t=j&&j.preferences&&j.preferences.theme;
      if(t==="light"||t==="dark"||t==="system")pref=t;
    }
  }catch(e){}
  var eff=pref;
  if(pref==="system"){
    eff=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
  }
  d.dataset.theme=eff;
  d.style.colorScheme=eff;
})();`;
