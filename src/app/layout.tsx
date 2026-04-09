import "./globals.css";
import type { Metadata } from "next";
import { ThemeInit } from "@/components/theme/ThemeInit";
import { PatientStoreBootstrap } from "@/components/providers/PatientStoreBootstrap";

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
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <body suppressHydrationWarning className="min-h-screen">
        <ThemeInit />
        <PatientStoreBootstrap />
        {children}
      </body>
    </html>
  );
}
