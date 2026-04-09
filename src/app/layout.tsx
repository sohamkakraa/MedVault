import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { ThemeInit } from "@/components/theme/ThemeInit";
import { PatientStoreBootstrap } from "@/components/providers/PatientStoreBootstrap";
import { THEME_BOOT_SCRIPT } from "@/lib/themePreference";

export const metadata: Metadata = {
  title: "UMA — Ur Medical Assistant",
  description: "UMA is your personal health companion and medical record assistant.",
  // Favicon: `src/app/icon.svg` (App Router). Legacy `/favicon.ico` → `/logo.svg` in `next.config.ts`.
  icons: {
    apple: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    title: "UMA",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen">
        <Script id="uma-theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <ThemeInit />
        <PatientStoreBootstrap />
        {children}
      </body>
    </html>
  );
}
