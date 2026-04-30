"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-[var(--border)] bg-[var(--panel)] py-6 px-4">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-5">
        {/* Sitemap — actionable links to app screens */}
        <div className="flex w-full max-w-2xl flex-wrap justify-center gap-x-5 gap-y-1.5 text-center text-xs text-[var(--muted)]">
          <Link href="/dashboard" className="hover:text-[var(--fg)] transition-colors">Dashboard</Link>
          <Link href="/chat" className="hover:text-[var(--fg)] transition-colors">Chat</Link>
          <Link href="/upload" className="hover:text-[var(--fg)] transition-colors">Upload</Link>
          <Link href="/profile" className="hover:text-[var(--fg)] transition-colors">Profile</Link>
          <Link href="/trackers" className="hover:text-[var(--fg)] transition-colors">Trackers</Link>
          <Link href="/health-log" className="hover:text-[var(--fg)] transition-colors">Health log</Link>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-[var(--border)]" />

        {/* Bottom row: copyright + legal links */}
        <div className="flex w-full flex-col items-center justify-center gap-3 text-center md:flex-row md:justify-between md:text-left">
          <p
            className="text-xs text-[var(--muted)] md:text-left"
            suppressHydrationWarning
          >
            © {new Date().getFullYear()} UMA Health · Not medical advice. Always consult your
            doctor for health decisions.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-xs text-[var(--muted)] md:justify-end">
            <Link href="/privacy" className="hover:text-[var(--fg)] transition-colors">
              Privacy Policy
            </Link>
            <span className="text-[var(--border)]">·</span>
            <Link href="/terms" className="hover:text-[var(--fg)] transition-colors">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
