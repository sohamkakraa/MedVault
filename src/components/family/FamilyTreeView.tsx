"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pencil, Check, User, Users, Heart, Baby, UserCircle, Link2 } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { getHydrationSafeStore, getStore, setActiveFamilyMember, saveStore, updateFamilyMemberMeta } from "@/lib/store";
import type { FamilyMemberMeta, FamilyRelation } from "@/lib/types";
import { FAMILY_RELATION_LABELS } from "@/lib/types";

/* ─── constants ──────────────────────────────────────────── */

const RELATION_OPTIONS: FamilyRelation[] = [
  "mother", "father", "spouse", "husband", "wife",
  "brother", "sister", "grandfather", "grandmother",
  "son", "daughter", "child", "other",
];

/** Return a Lucide icon for a family relation. */
function RelationIcon({ relation, className }: { relation: string; className?: string }) {
  const cls = cn("h-5 w-5 shrink-0", className);
  switch (relation) {
    case "mother":
    case "father":
    case "grandfather":
    case "grandmother":
      return <Users className={cls} />;
    case "spouse":
    case "husband":
    case "wife":
      return <Heart className={cls} />;
    case "son":
    case "daughter":
    case "child":
      return <Baby className={cls} />;
    case "brother":
    case "sister":
      return <UserCircle className={cls} />;
    case "self":
      return <User className={cls} />;
    default:
      return <User className={cls} />;
  }
}

/* ─── generation bucketing ───────────────────────────────── */

type Generation = "grandparents" | "parents" | "self" | "children";

function getGeneration(relation: FamilyRelation): Generation {
  if (relation === "grandfather" || relation === "grandmother") return "grandparents";
  if (relation === "mother" || relation === "father") return "parents";
  if (relation === "son" || relation === "daughter" || relation === "child") return "children";
  return "self"; // siblings, spouse, other — share the self row
}

/* ─── inline edit panel ──────────────────────────────────── */

interface EditPanelProps {
  member: FamilyMemberMeta;
  onSave: (patch: Partial<Pick<FamilyMemberMeta, "displayName" | "relation" | "fullName" | "linkedEmail" | "linkedPhone">>) => void;
  onClose: () => void;
}

function EditPanel({ member, onSave, onClose }: EditPanelProps) {
  const [displayName, setDisplayName] = useState(member.displayName);
  const [fullName, setFullName] = useState(member.fullName ?? "");
  const [relation, setRelation] = useState<FamilyRelation>(member.relation);
  const [linkedEmail, setLinkedEmail] = useState(member.linkedEmail ?? "");
  const [linkedPhone, setLinkedPhone] = useState(member.linkedPhone ?? "");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  function handleSave() {
    if (!displayName.trim()) return;
    onSave({
      displayName: displayName.trim(),
      fullName: fullName.trim() || undefined,
      relation,
      linkedEmail: linkedEmail.trim() || undefined,
      linkedPhone: linkedPhone.trim() || undefined,
    });
  }

  return (
    <div
      ref={ref}
      className="absolute z-10 top-full mt-2 left-1/2 -translate-x-1/2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl p-4 space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold text-[var(--fg)]">Edit {member.displayName}</p>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
        Nickname / how you call them
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
        Full legal name
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
          placeholder="e.g. Rajesh Kumar"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
        Relation to you
        <Select value={relation} onValueChange={(v) => setRelation(v as FamilyRelation)}>
          <SelectTrigger className="h-8 rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RELATION_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>{FAMILY_RELATION_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
        Their UMA account email
        <input
          type="email"
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
          placeholder="their@email.com"
          value={linkedEmail}
          onChange={(e) => setLinkedEmail(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
        Their phone number
        <input
          type="tel"
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
          placeholder="+91 98765 43210"
          value={linkedPhone}
          onChange={(e) => setLinkedPhone(e.target.value)}
        />
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-1.5 text-xs font-semibold text-[var(--accent-contrast)] hover:opacity-90 transition-opacity"
        >
          <Check className="h-3 w-3" /> Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── single tree node card ──────────────────────────────── */

interface NodeCardProps {
  member: FamilyMemberMeta;
  isSelf?: boolean;
  onEditSave: (id: string, patch: Partial<Pick<FamilyMemberMeta, "displayName" | "relation" | "fullName" | "linkedEmail" | "linkedPhone">>) => void;
  onNavigate: (id: string) => void;
}

function NodeCard({ member, isSelf = false, onEditSave, onNavigate }: NodeCardProps) {
  const [editing, setEditing] = useState(false);

  const label = FAMILY_RELATION_LABELS[member.relation];
  const primaryName = member.fullName || member.displayName;
  const secondaryName = member.fullName && member.fullName !== member.displayName ? member.displayName : null;

  if (isSelf) {
    const store = getStore();
    const selfName = store.profile.firstName || store.profile.name || "You";
    return (
      <div className="relative flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent)]/8 min-w-[96px]">
        <User className="h-5 w-5 text-[var(--accent)]" />
        <p className="text-sm font-semibold text-[var(--fg)] leading-tight">{selfName}</p>
        <p className="text-[10px] text-[var(--accent)] font-medium">You</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "relative flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border transition-all min-w-[96px] group",
          "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 cursor-pointer"
        )}
        onClick={() => onNavigate(member.id)}
      >
        <RelationIcon relation={member.relation} className="text-[var(--muted)]" />
        <p className="text-sm font-medium text-[var(--fg)] leading-tight text-center">{primaryName}</p>
        {secondaryName && (
          <p className="text-[10px] text-[var(--muted)] leading-tight">&ldquo;{secondaryName}&rdquo;</p>
        )}
        <p className="text-[10px] text-[var(--muted)]">{label}</p>
        {member.linkedEmail && (
          <p className="text-[9px] text-[var(--accent)]/70 truncate max-w-[88px] flex items-center gap-0.5" title={member.linkedEmail}>
            <Link2 className="h-2.5 w-2.5 inline" /> linked
          </p>
        )}

        {/* edit button — appears on hover */}
        <button
          type="button"
          aria-label="Edit"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-[var(--panel)] border border-[var(--border)] shadow grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Pencil className="h-3 w-3 text-[var(--muted)]" />
        </button>
      </div>

      {editing && (
        <EditPanel
          member={member}
          onSave={(patch) => { onEditSave(member.id, patch); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/* ─── connector lines via SVG overlay ────────────────────── */

interface ConnectorProps {
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function Connector({ fromRef, toRef, containerRef }: ConnectorProps) {
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    function compute() {
      if (!fromRef.current || !toRef.current || !containerRef.current) return;
      const box = containerRef.current.getBoundingClientRect();
      const a = fromRef.current.getBoundingClientRect();
      const b = toRef.current.getBoundingClientRect();

      const x1 = a.left + a.width / 2 - box.left;
      const y1 = a.bottom - box.top;
      const x2 = b.left + b.width / 2 - box.left;
      const y2 = b.top - box.top;
      const mid = (y1 + y2) / 2;

      setPath(`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
    }
    // Delay compute to let DOM layout settle
    const timer = setTimeout(compute, 100);
    window.addEventListener("resize", compute);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", compute);
    };
  }, [fromRef, toRef, containerRef]);

  if (!path) return null;
  return (
    <path
      d={path}
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
      strokeDasharray="6 4"
      opacity="0.5"
    />
  );
}

/* ─── main component ─────────────────────────────────────── */

export function FamilyTreeView({ onClose }: { onClose: () => void }) {
  const [store, setStoreState] = useState(() => getHydrationSafeStore());
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceRender] = useState(0);

  // node refs keyed by member id (for SVG connectors)
  const nodeRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});
  const selfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function refresh() {
      setStoreState(getStore());
    }
    refresh();
    setMounted(true);
    window.addEventListener("mv-store-update", refresh);
    return () => window.removeEventListener("mv-store-update", refresh);
  }, []);

  // Lock body scroll while the modal is open so the viewport doesn't jump.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Force a re-render after mount so connectors can measure DOM positions
  useEffect(() => {
    const timer = setTimeout(() => forceRender((n) => n + 1), 200);
    return () => clearTimeout(timer);
  }, []);

  const familyMembers = store.familyMembers ?? [];
  const familyLinks = store.familyLinks ?? [];

  function handleEditSave(
    id: string,
    patch: Partial<Pick<FamilyMemberMeta, "displayName" | "relation" | "fullName" | "linkedEmail" | "linkedPhone">>
  ) {
    updateFamilyMemberMeta(id, patch);
    setStoreState(getStore());
  }

  function handleNavigate(id: string) {
    setActiveFamilyMember(id);
    onClose();
    window.location.href = "/dashboard";
  }

  // Ensure a ref exists for every member
  for (const m of familyMembers) {
    if (!nodeRefs.current[m.id]) {
      nodeRefs.current[m.id] = { current: null } as React.RefObject<HTMLDivElement | null>;
    }
  }

  // Bucket members into generations
  const grandparents = familyMembers.filter((m) => getGeneration(m.relation) === "grandparents");
  const parents = familyMembers.filter((m) => getGeneration(m.relation) === "parents");
  const selfRow = familyMembers.filter((m) => getGeneration(m.relation) === "self");
  const children = familyMembers.filter((m) => getGeneration(m.relation) === "children");

  const isEmpty = familyMembers.length === 0 && familyLinks.length === 0;

  // Collect connector pairs: (parentId or "self") → childId
  type ConnPair = { from: string; to: string };
  const connectors: ConnPair[] = [];

  for (const gp of grandparents) {
    for (const p of parents) {
      connectors.push({ from: gp.id, to: p.id });
    }
  }
  for (const p of parents) {
    connectors.push({ from: p.id, to: "self" });
  }
  for (const c of children) {
    connectors.push({ from: "self", to: c.id });
  }

  // Siblings connect to parents if parents exist
  const siblings = selfRow.filter((m) => m.relation === "brother" || m.relation === "sister");
  for (const sib of siblings) {
    for (const p of parents) {
      connectors.push({ from: p.id, to: sib.id });
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Family tree"
    >
      <div
        className="relative my-auto max-w-3xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl bg-[var(--panel)] border border-[var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-6 pb-4 bg-[var(--panel)] border-b border-[var(--border)]/60">
          <div>
            <h2 className="text-base font-semibold text-[var(--fg)]">Family tree</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Hover a card and tap the pencil to edit. Click a card to view their dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--panel-2)] rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-[var(--muted)]" />
          </button>
        </div>

        {/* body */}
        <div ref={containerRef} className="relative px-6 py-8">
          {isEmpty ? (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--muted)] mb-4">No family members added yet.</p>
              <a
                href="/profile#profile-family"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Add family members
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-10">

              {/* grandparents row */}
              {grandparents.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {grandparents.map((m) => (
                    <div key={m.id} ref={nodeRefs.current[m.id] as React.RefObject<HTMLDivElement>}>
                      <NodeCard
                        member={m}
                        onEditSave={handleEditSave}
                        onNavigate={handleNavigate}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* parents row */}
              {parents.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {parents.map((m) => (
                    <div key={m.id} ref={nodeRefs.current[m.id] as React.RefObject<HTMLDivElement>}>
                      <NodeCard
                        member={m}
                        onEditSave={handleEditSave}
                        onNavigate={handleNavigate}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* self row — you + siblings + spouse */}
              <div className="flex flex-wrap justify-center items-center gap-3">
                {/* siblings left */}
                {selfRow
                  .filter((m) => m.relation === "brother" || m.relation === "sister")
                  .map((m) => (
                    <div key={m.id} ref={nodeRefs.current[m.id] as React.RefObject<HTMLDivElement>}>
                      <NodeCard
                        member={m}
                        onEditSave={handleEditSave}
                        onNavigate={handleNavigate}
                      />
                    </div>
                  ))}

                {/* horizontal dash before you (if spouse exists) */}
                {selfRow.some((m) => m.relation === "spouse" || m.relation === "husband" || m.relation === "wife") && (
                  <div className="w-6 h-px border-t-2 border-dashed border-[var(--accent)] opacity-40" />
                )}

                {/* YOU */}
                <div ref={selfRef}>
                  <NodeCard
                    member={{ id: "self", relation: "self", displayName: "You", addedAtISO: "" }}
                    isSelf
                    onEditSave={() => {}}
                    onNavigate={() => {}}
                  />
                </div>

                {/* horizontal dash + spouse */}
                {selfRow
                  .filter((m) => m.relation === "spouse" || m.relation === "husband" || m.relation === "wife")
                  .map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3">
                      {i === 0 && (
                        <div className="w-6 h-px border-t-2 border-dashed border-[var(--accent)] opacity-40" />
                      )}
                      <div ref={nodeRefs.current[m.id] as React.RefObject<HTMLDivElement>}>
                        <NodeCard
                          member={m}
                          onEditSave={handleEditSave}
                          onNavigate={handleNavigate}
                        />
                      </div>
                    </div>
                  ))}

                {/* other */}
                {selfRow
                  .filter((m) => m.relation === "other")
                  .map((m) => (
                    <div key={m.id} ref={nodeRefs.current[m.id] as React.RefObject<HTMLDivElement>}>
                      <NodeCard
                        member={m}
                        onEditSave={handleEditSave}
                        onNavigate={handleNavigate}
                      />
                    </div>
                  ))}
              </div>

              {/* children row */}
              {children.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {children.map((m) => (
                    <div key={m.id} ref={nodeRefs.current[m.id] as React.RefObject<HTMLDivElement>}>
                      <NodeCard
                        member={m}
                        onEditSave={handleEditSave}
                        onNavigate={handleNavigate}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* linked accounts row */}
              {familyLinks.length > 0 && (
                <div className="w-full pt-2 border-t border-dashed border-[var(--border)]/60">
                  <p className="text-[10px] text-[var(--muted)] text-center mb-3 flex items-center justify-center gap-1">
                    <Link2 className="h-3 w-3" /> Linked accounts (cross-account)
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {familyLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 min-w-[96px]"
                      >
                        <RelationIcon relation={link.relation} className="text-[var(--accent)]" />
                        <p className="text-sm font-medium text-[var(--fg)] text-center leading-tight">
                          {link.linkedDisplayName || link.linkedAccountName}
                        </p>
                        <p className="text-[10px] text-[var(--muted)]">{FAMILY_RELATION_LABELS[link.relation]}</p>
                        <p className="text-[9px] text-[var(--accent)]/70 truncate max-w-[88px]" title={link.linkedAccountEmail}>
                          {link.linkedAccountEmail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* SVG connector lines — rendered over the layout */}
          {!isEmpty && (
            <svg
              className="pointer-events-none absolute inset-0 w-full h-full overflow-visible"
              style={{ top: 0, left: 0 }}
              aria-hidden
            >
              {connectors.map(({ from, to }) => {
                const fromRef = from === "self" ? selfRef : nodeRefs.current[from];
                const toRef = to === "self" ? selfRef : nodeRefs.current[to];
                if (!fromRef || !toRef) return null;
                return (
                  <Connector
                    key={`${from}-${to}`}
                    fromRef={fromRef as React.RefObject<HTMLDivElement | null>}
                    toRef={toRef as React.RefObject<HTMLDivElement | null>}
                    containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
                  />
                );
              })}
            </svg>
          )}
        </div>

        {/* legend */}
        {!isEmpty && (
          <div className="px-6 pb-5 flex flex-wrap gap-4 text-[10px] text-[var(--muted)] border-t border-[var(--border)]/40 pt-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" /> You
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-[var(--accent)] opacity-50" />
              Family connection
            </span>
            <span className="flex items-center gap-1.5"><Pencil className="h-2.5 w-2.5" /> Hover to edit a card</span>
            <span className="flex items-center gap-1.5"><User className="h-2.5 w-2.5" /> Tap to view their records</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
