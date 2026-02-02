"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/dashboard";
  const router = useRouter();

  const [email, setEmail] = useState("demo@medvault.local");
  const [password, setPassword] = useState("demo");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Login failed");
      router.push(next);
      router.refresh();
    } catch (e: any) {
      setErr(e.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold mv-title">MedVault</h1>
              <p className="text-sm mv-muted">
                Your personal medical history vault (prototype).
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-xs mv-muted">Email</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mv-muted">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              {err && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                  {err}
                </div>
              )}

              <Button disabled={loading} className="w-full">
                {loading ? "Signing in..." : "Sign in"}
              </Button>

              <p className="text-xs mv-muted">
                Prototype login: any non-empty email/password works.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
