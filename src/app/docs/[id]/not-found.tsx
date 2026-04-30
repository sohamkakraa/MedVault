import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowLeft } from "lucide-react";

export default function DocNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-lg font-semibold text-[var(--fg)]">Report not found</h1>
        <p className="text-sm text-[var(--muted)]">
          We couldn&#39;t find this report. It may have been removed, or the link is incorrect.
        </p>
        <Link href="/dashboard">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
