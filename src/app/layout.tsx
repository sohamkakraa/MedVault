import "./globals.css";
import type { Metadata } from "next";
import { ChatDock } from "@/components/chat/ChatDock";
import { ThemeInit } from "@/components/theme/ThemeInit";

export const metadata: Metadata = {
  title: "MedVault Prototype",
  description: "Personal medical history vault prototype",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <body suppressHydrationWarning className="min-h-screen">
        <ThemeInit />
        {children}
        <ChatDock />
      </body>
    </html>
  );
}
