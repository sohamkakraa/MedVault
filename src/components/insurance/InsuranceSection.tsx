"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { Plus, Trash2, Shield, FileText, Send, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { InsurancePlan, InsuranceClaim, PatientStore } from "@/lib/types";
import { randomUUID } from "@/lib/clientUuid";

const CLAIM_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_documents: "Pending Documents",
  under_review: "Under Review",
  approved: "Approved",
  partially_approved: "Partially Approved",
  rejected: "Rejected",
  appeal: "Appeal",
  settled: "Settled",
  withdrawn: "Withdrawn",
};

const CLAIM_STATUS_COLORS: Record<string, string> = {
  draft: "bg-[var(--panel-2)] text-[var(--muted)]",
  submitted: "bg-blue-500/15 text-blue-400",
  pending_documents: "bg-yellow-500/15 text-yellow-400",
  under_review: "bg-blue-500/15 text-blue-400",
  approved: "bg-green-500/15 text-green-400",
  partially_approved: "bg-green-500/10 text-green-500",
  rejected: "bg-red-500/15 text-red-400",
  appeal: "bg-orange-500/15 text-orange-400",
  settled: "bg-green-500/20 text-green-400",
  withdrawn: "bg-[var(--panel-2)] text-[var(--muted)]",
};


interface Props {
  store: PatientStore;
  onStoreChange: () => void;
}

export function InsuranceSection({ store, onStoreChange }: Props) {
  const [plans, setPlans] = useState<InsurancePlan[]>(store.insurancePlans ?? []);
  const [claims, setClaims] = useState<InsuranceClaim[]>(store.insuranceClaims ?? []);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftingClaimId, setDraftingClaimId] = useState<string | null>(null);
  const [sendingClaimId, setSendingClaimId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New plan form
  const [newPlan, setNewPlan] = useState<Partial<InsurancePlan>>({
    active: true,
    currency: "₹",
    policyType: "individual",
  });

  // Sync from store changes
  useEffect(() => {
    setPlans(store.insurancePlans ?? []);
    setClaims(store.insuranceClaims ?? []);
  }, [store.insurancePlans, store.insuranceClaims]);

  async function savePlan() {
    if (!newPlan.insurerName?.trim() || !newPlan.policyNumber?.trim()) {
      setErrorMsg("Insurer name and policy number are required.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const id = newPlan.id ?? randomUUID();
      const res = await fetch("/api/insurance/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPlan, id }),
      });
      const data = await res.json() as { ok: boolean; plan?: InsurancePlan; error?: string };
      if (!data.ok) { setErrorMsg(data.error ?? "Failed to save."); return; }
      setPlans((prev) => {
        const idx = prev.findIndex((p) => p.id === id);
        if (idx >= 0) { const next = [...prev]; next[idx] = data.plan!; return next; }
        return [data.plan!, ...prev];
      });
      setNewPlan({ active: true, currency: "₹", policyType: "individual" });
      setShowAddPlan(false);
      onStoreChange();
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan(id: string) {
    if (!confirm("Remove this insurance plan?")) return;
    await fetch(`/api/insurance/plans?id=${id}`, { method: "DELETE" });
    setPlans((prev) => prev.filter((p) => p.id !== id));
    onStoreChange();
  }

  async function draftClaimForBill(docId: string, planId?: string) {
    setDraftingClaimId(docId);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/insurance/draft-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relatedDocIds: [docId], planId, claimType: "reimbursement" }),
      });
      const data = await res.json() as { ok: boolean; claim?: InsuranceClaim; error?: string };
      if (!data.ok) { setErrorMsg(data.error ?? "Failed to draft."); return; }
      setClaims((prev) => [data.claim!, ...prev.filter((c) => c.id !== data.claim!.id)]);
      setExpandedClaimId(data.claim!.id);
      onStoreChange();
    } finally {
      setDraftingClaimId(null);
    }
  }

  async function sendClaim(claim: InsuranceClaim) {
    const plan = plans.find((p) => p.id === claim.planId);
    const toEmail = plan?.claimEmailAddress || prompt("Enter the insurer's claim email address:");
    if (!toEmail) return;
    setSendingClaimId(claim.id);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/insurance/send-claim-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: claim.id,
          toEmail,
          subject: claim.draftEmailSubject,
          body: claim.draftEmailBody,
          fromName: [store.profile.firstName, store.profile.lastName].filter(Boolean).join(" ") || store.profile.name,
          replyTo: store.profile.email,
        }),
      });
      const data = await res.json() as { ok: boolean; claim?: InsuranceClaim; warning?: string; error?: string };
      if (!data.ok) { setErrorMsg(data.error ?? "Failed to send."); return; }
      if (data.warning) setErrorMsg(data.warning);
      setClaims((prev) => prev.map((c) => c.id === claim.id ? data.claim! : c));
      onStoreChange();
    } finally {
      setSendingClaimId(null);
    }
  }

  const billsNeedingClaim = (store.docs ?? []).filter(
    (d) => d.type === "Bill" && d.billInsuranceStatus === "needs_claim"
  );

  return (
    <Card id="profile-insurance" className="scroll-mt-24">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="text-sm font-medium">Insurance</h2>
            {plans.length > 0 && <Badge>{plans.length} {plans.length === 1 ? "plan" : "plans"}</Badge>}
          </div>
          <Button
            variant="ghost"
           
            className="gap-1 text-xs"
            onClick={() => setShowAddPlan((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" /> Add plan
          </Button>
        </div>
        <p className="text-xs mv-muted mt-1">
          Add your insurance policies so UMA can detect reimbursable bills and help you file claims.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {errorMsg && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{errorMsg}</p>
        )}

        {/* Add plan form */}
        {showAddPlan && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4 space-y-3">
            <p className="text-xs font-medium">New insurance plan</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs mv-muted">
                Insurer name *
                <Input
                  value={newPlan.insurerName ?? ""}
                  onChange={(e) => setNewPlan((p) => ({ ...p, insurerName: e.target.value }))}
                  placeholder="e.g. Star Health, HDFC ERGO"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs mv-muted">
                Policy number *
                <Input
                  value={newPlan.policyNumber ?? ""}
                  onChange={(e) => setNewPlan((p) => ({ ...p, policyNumber: e.target.value }))}
                  placeholder="e.g. P/19116/01/2024/000123"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs mv-muted">
                Policy type
                <Select
                  value={newPlan.policyType ?? "individual"}
                  onValueChange={(v) => setNewPlan((p) => ({ ...p, policyType: v as InsurancePlan["policyType"] }))}
                >
                  <SelectTrigger className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="family">Family floater</SelectItem>
                    <SelectItem value="group">Group / employer</SelectItem>
                    <SelectItem value="senior_citizen">Senior citizen</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs mv-muted">
                Sum insured
                <div className="flex gap-1">
                  <Input
                    className="w-14 shrink-0"
                    value={newPlan.currency ?? "₹"}
                    onChange={(e) => setNewPlan((p) => ({ ...p, currency: e.target.value }))}
                  />
                  <Input
                    type="number"
                    value={newPlan.coverageAmount ?? ""}
                    onChange={(e) => setNewPlan((p) => ({ ...p, coverageAmount: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 500000"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs mv-muted">
                Claim email address
                <Input
                  type="email"
                  value={newPlan.claimEmailAddress ?? ""}
                  onChange={(e) => setNewPlan((p) => ({ ...p, claimEmailAddress: e.target.value }))}
                  placeholder="claims@insurer.com"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs mv-muted">
                Renewal date
                <Input
                  type="date"
                  value={newPlan.renewalDateISO ?? ""}
                  onChange={(e) => setNewPlan((p) => ({ ...p, renewalDateISO: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs mv-muted sm:col-span-2">
                TPA name (if any)
                <Input
                  value={newPlan.tpaName ?? ""}
                  onChange={(e) => setNewPlan((p) => ({ ...p, tpaName: e.target.value }))}
                  placeholder="e.g. MD India, Medi Assist"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={savePlan} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save plan"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowAddPlan(false); setNewPlan({ active: true, currency: "₹", policyType: "individual" }); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Plans list */}
        {plans.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium mv-muted">Your plans</p>
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{plan.insurerName}</p>
                  <p className="text-xs mv-muted truncate">Policy: {plan.policyNumber}</p>
                  {plan.coverageAmount != null && (
                    <p className="text-xs mv-muted">Cover: {plan.currency ?? ""}{plan.coverageAmount.toLocaleString()}</p>
                  )}
                  {plan.renewalDateISO && (
                    <p className="text-xs mv-muted">Renews: {plan.renewalDateISO}</p>
                  )}
                  {plan.claimEmailAddress && (
                    <p className="text-xs mv-muted">Claims: {plan.claimEmailAddress}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deletePlan(plan.id)}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  aria-label="Remove plan"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {plans.length === 0 && !showAddPlan && (
          <p className="text-xs mv-muted py-2">No insurance plans added yet. Click &quot;Add plan&quot; to get started.</p>
        )}

        {/* Bills needing a claim */}
        {billsNeedingClaim.length > 0 && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-2">
            <p className="text-sm font-medium text-yellow-400">Bills that may need a claim</p>
            <p className="text-xs mv-muted">UMA detected the following bills where no insurance appears to have been applied.</p>
            {billsNeedingClaim.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-xs mv-muted">{doc.dateISO ?? "Date unknown"}{doc.billTotalAmount != null ? ` · Total: ${doc.billTotalAmount}` : ""}</p>
                </div>
                <Button
                 
                  variant="ghost"
                  className="shrink-0 text-xs gap-1"
                  disabled={draftingClaimId === doc.id}
                  onClick={() => draftClaimForBill(doc.id, plans.find((p) => p.active !== false)?.id)}
                >
                  {draftingClaimId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                  Draft claim
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Claims list */}
        {claims.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium mv-muted">Claims tracker</p>
            {claims.map((claim) => {
              const plan = plans.find((p) => p.id === claim.planId);
              const isExpanded = expandedClaimId === claim.id;
              return (
                <div key={claim.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium capitalize">{claim.type} claim</span>
                        {plan && <span className="text-xs mv-muted">· {plan.insurerName}</span>}
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${CLAIM_STATUS_COLORS[claim.status] ?? ""}`}>
                          {CLAIM_STATUS_LABELS[claim.status] ?? claim.status}
                        </span>
                      </div>
                      {claim.amountClaimed != null && (
                        <p className="text-xs mv-muted">Amount: {claim.amountClaimed.toLocaleString()}</p>
                      )}
                      {claim.providerName && (
                        <p className="text-xs mv-muted truncate">Provider: {claim.providerName}</p>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 mv-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 mv-muted" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
                      {claim.draftEmailSubject && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Draft email</p>
                          <p className="text-xs mv-muted font-medium">Subject: {claim.draftEmailSubject}</p>
                          <pre className="text-xs mv-muted whitespace-pre-wrap max-h-40 overflow-y-auto rounded-lg bg-[var(--panel)] p-3 leading-relaxed">
                            {claim.draftEmailBody}
                          </pre>
                        </div>
                      )}

                      {claim.correspondence && claim.correspondence.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Correspondence ({claim.correspondence.length})</p>
                          {claim.correspondence.map((c) => (
                            <div key={c.id} className="text-xs mv-muted rounded-lg bg-[var(--panel)] p-2">
                              <span className="font-medium">{c.direction === "outgoing" ? "Sent" : "Received"}</span>
                              {c.sentAtISO && ` · ${new Date(c.sentAtISO).toLocaleDateString()}`}
                              {c.toEmail && ` → ${c.toEmail}`}
                              <span className="block truncate">{c.subject}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        {claim.status === "draft" && (
                          <Button
                           
                            className="gap-1 text-xs"
                            disabled={sendingClaimId === claim.id}
                            onClick={() => sendClaim(claim)}
                          >
                            {sendingClaimId === claim.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Send claim email
                          </Button>
                        )}
                        <Button
                         
                          variant="ghost"
                          className="gap-1 text-xs text-red-400 hover:bg-red-500/10"
                          onClick={async () => {
                            if (!confirm("Delete this claim?")) return;
                            await fetch(`/api/insurance/claims?id=${claim.id}`, { method: "DELETE" });
                            setClaims((prev) => prev.filter((c) => c.id !== claim.id));
                            onStoreChange();
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
