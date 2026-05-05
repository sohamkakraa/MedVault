"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { DatePicker } from "@/components/ui/DatePicker";
import { Combobox } from "@/components/ui/Combobox";
import { Badge } from "@/components/ui/Badge";
import {
  clearLocalPatientStore,
  getHydrationSafeStore,
  getStore,
  getHydrationSafeViewingStore,
  getViewingStore,
  saveViewingStore,
  getActiveFamilyMember,
  setActiveFamilyMember,
  addFamilyMember,
  removeFamilyMember,
  updateFamilyMemberMeta,
} from "@/lib/store";
import { FAMILY_RELATION_LABELS } from "@/lib/types";
import { COUNTRY_CODES } from "@/lib/countryCodes";
import type {
  FamilyMemberMeta,
  FamilyRelation,
  FamilyLinkVisibility,
  FamilyConnectionRequest,
  FamilyLink,
} from "@/lib/types";
import {
  sendFamilyConnectionRequest,
  getIncomingRequests,
  acceptFamilyRequest,
  rejectFamilyRequest,
  getFamilyLinks,
  removeFamilyLink,
  getSentFamilyRequests,
  getInverseRelation,
} from "@/lib/familyConnections";
import type { AccountRegistryEntry } from "@/lib/accountRegistry";
import { isEmailOnPlatform, lookupByEmail } from "@/lib/accountRegistry";
import {
  doctorNamesFromDocs,
  facilityNamesFromDocs,
  mergeDoctorQuickPick,
  mergeFacilityQuickPick,
  normPickKey,
} from "@/lib/providerQuickPick";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { Footer } from "@/components/ui/Footer";
import { InsuranceSection } from "@/components/insurance/InsuranceSection";
import { Droplets, Plus, LogOut, Ruler, Users, Trash2, Link2, UserCheck, UserX, Send, Mail, Check, X } from "lucide-react";

const RELATION_EMOJI: Record<string, string> = {
  mother: "👩", father: "👨", spouse: "💑", husband: "🧑", wife: "👩",
  brother: "👦", sister: "👧", grandfather: "👴", grandmother: "👵",
  son: "👦", daughter: "👧", child: "🧒", other: "🧑", self: "🙋",
};

const RELATION_OPTIONS: FamilyRelation[] = [
  "mother", "father", "spouse", "husband", "wife",
  "brother", "sister", "grandfather", "grandmother",
  "son", "daughter", "child", "other",
];


const COMMON_ALLERGIES = [
  "Penicillin", "Amoxicillin", "Aspirin", "Ibuprofen", "Sulfa drugs",
  "Codeine", "Latex", "Peanuts", "Tree nuts", "Shellfish", "Fish",
  "Milk / Dairy", "Eggs", "Wheat / Gluten", "Soy", "Sesame",
  "Bee stings", "Wasp stings", "Cat hair", "Dog hair", "Dust mites",
  "Pollen", "Mould", "Nickel", "Iodine", "Contrast dye",
];

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

function parseLengthToCm(raw: string, unit: "cm" | "in"): string | undefined {
  const t = raw.trim().replace(",", ".");
  if (!t) return undefined;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return undefined;
  const cm = unit === "in" ? n * CM_PER_IN : n;
  return String(Math.round(cm * 10) / 10);
}

function cmToLengthDisplay(cmStr: string | number | undefined, unit: "cm" | "in"): string {
  if (cmStr === undefined || cmStr === null || cmStr === "") return "";
  const s = String(cmStr).trim();
  if (!s) return "";
  const cm = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(cm)) return s;
  if (unit === "in") return String(Math.round((cm / CM_PER_IN) * 10) / 10);
  return String(Math.round(cm * 10) / 10);
}

function parseWeightToKg(raw: string, unit: "kg" | "lb"): string | undefined {
  const t = raw.trim().replace(",", ".");
  if (!t) return undefined;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return undefined;
  const kg = unit === "lb" ? n / LB_PER_KG : n;
  return String(Math.round(kg * 10) / 10);
}

function kgToWeightDisplay(kgStr: string | number | undefined, unit: "kg" | "lb"): string {
  if (kgStr === undefined || kgStr === null || kgStr === "") return "";
  const s = String(kgStr).trim();
  if (!s) return "";
  const kg = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(kg)) return s;
  if (unit === "lb") return String(Math.round(kg * LB_PER_KG * 10) / 10);
  return String(Math.round(kg * 10) / 10);
}

const COMMON_CONDITIONS = [
  // Acute symptoms & events
  "Headache", "Chest pain", "Heart palpitations", "Shortness of breath",
  "Dizziness", "Fatigue", "Back pain", "Joint pain", "Abdominal pain",
  "Nausea", "Insomnia", "Fever", "Weight loss", "Weight gain",
  // Past events
  "Heart attack", "Stroke", "Paralysis attack (TIA)", "Pulmonary embolism",
  "Deep vein thrombosis", "Seizure", "Fracture", "Surgery",
  // Chronic diagnosed conditions
  "Type 2 Diabetes", "Type 1 Diabetes", "Hypertension", "Asthma",
  "COPD", "Hypothyroidism", "Hyperthyroidism", "High cholesterol",
  "Coronary artery disease", "Atrial fibrillation", "Heart failure",
  "Chronic kidney disease", "GERD / Acid reflux", "IBS",
  "Crohn's disease", "Ulcerative colitis", "Rheumatoid arthritis",
  "Osteoarthritis", "Osteoporosis", "PCOS", "Endometriosis",
  "Anxiety", "Depression", "ADHD", "Migraine", "Epilepsy",
  "Parkinson's disease", "Alzheimer's / Dementia", "Sleep apnoea",
  "Anaemia", "HIV / AIDS", "Hepatitis B", "Hepatitis C",
  "Thyroid cancer", "Breast cancer", "Prostate cancer",
];

// Relation auto-inference table: when user sets relation for person A,
// use this table to infer likely relations for other selected people
const RELATION_INFERENCE: Record<string, Record<string, FamilyRelation>> = {
  father: { wife: "mother", husband: "mother", son: "brother", daughter: "sister" },
  mother: { husband: "father", wife: "father", son: "brother", daughter: "sister" },
  brother: { mother: "mother", father: "father", wife: "other", husband: "other" },
  sister: { mother: "mother", father: "father", husband: "other", wife: "other" },
  grandfather: { wife: "grandmother" },
  grandmother: { husband: "grandfather" },
  son: { wife: "other", husband: "other" },
  daughter: { wife: "other", husband: "other" },
  spouse: { mother: "other", father: "other" },
  husband: { mother: "other", father: "other" },
  wife: { mother: "other", father: "other" },
  child: { mother: "mother", father: "father" },
  other: {},
  self: {},
};

// Helper: Auto-infer relations for other selected people based on relation inference table
function inferRelationForPerson(
  changedRelation: FamilyRelation,
  otherPerson: AccountRegistryEntry
): FamilyRelation | null {
  const otherRegistryRelation = otherPerson.relation;
  if (!otherRegistryRelation) return null;

  const inferenceMap = RELATION_INFERENCE[changedRelation];
  if (!inferenceMap) return null;

  return inferenceMap[otherRegistryRelation] || null;
}

// ConnectFlow component: encapsulates the 3-step flow
function ConnectFlow({
  step,
  email,
  emailError,
  lookupResult,
  notOnPlatform,
  inviteSent,
  selections,
  visibility,
  sendResult,
  userEmail,
  onEmailChange,
  onEmailError,
  onLookupResult,
  onNotOnPlatform,
  onInviteSent,
  onSelections,
  onVisibility,
  onSendResult,
  onStep,
  onSentRequests,
}: {
  step: 1 | 2 | 3;
  email: string;
  emailError: string | null;
  lookupResult: AccountRegistryEntry[];
  notOnPlatform: boolean;
  inviteSent: boolean;
  selections: Record<string, { selected: boolean; relation: FamilyRelation | null }>;
  visibility: FamilyLinkVisibility;
  sendResult: string | null;
  userEmail: string;
  onEmailChange: (v: string) => void;
  onEmailError: (v: string | null) => void;
  onLookupResult: (v: AccountRegistryEntry[]) => void;
  onNotOnPlatform: (v: boolean) => void;
  onInviteSent: (v: boolean) => void;
  onSelections: (v: Record<string, { selected: boolean; relation: FamilyRelation | null }>) => void;
  onVisibility: (v: FamilyLinkVisibility) => void;
  onSendResult: (v: string | null) => void;
  onStep: (v: 1 | 2 | 3) => void;
  onSentRequests: (v: FamilyConnectionRequest[]) => void;
}) {
  const handleEmailLookup = () => {
    onEmailError(null);
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      onEmailError("Please enter an email address.");
      return;
    }

    if (trimmedEmail === (userEmail || "").toLowerCase()) {
      onEmailError("That's your own email.");
      return;
    }

    const existingLinks = getFamilyLinks();
    if (existingLinks.some(l => l.linkedAccountEmail.toLowerCase() === trimmedEmail)) {
      onEmailError("Already connected with this email.");
      return;
    }

    if (!isEmailOnPlatform(trimmedEmail)) {
      onNotOnPlatform(true);
      return;
    }

    const profiles = lookupByEmail(trimmedEmail);
    if (profiles.length === 0) {
      onNotOnPlatform(true);
      return;
    }

    onLookupResult(profiles);
    onStep(2);
  };

  const handleSendInvite = () => {
    onInviteSent(true);
    setTimeout(() => {
      onEmailChange("");
      onEmailError(null);
      onNotOnPlatform(false);
      onInviteSent(false);
    }, 3000);
  };

  const autoInferRelations = (changedPersonId: string, newRelation: FamilyRelation) => {
    const newSelections = { ...selections };

    for (const otherPerson of lookupResult) {
      if (otherPerson.internalId === changedPersonId) continue;
      if (!newSelections[otherPerson.internalId]?.selected) continue;

      const inferred = inferRelationForPerson(newRelation, otherPerson);

      if (inferred) {
        newSelections[otherPerson.internalId] = {
          selected: true,
          relation: inferred,
        };
      }
    }

    onSelections(newSelections);
  };

  const handleSendConnectRequests = () => {
    const selectedPeople = Object.entries(selections)
      .filter(([_, s]) => s.selected && s.relation)
      .map(([personId, s]) => ({
        personId,
        relation: s.relation!,
      }));

    if (selectedPeople.length === 0) return;

    for (const { personId, relation } of selectedPeople) {
      const person = lookupResult.find(p => p.internalId === personId);
      if (!person) continue;

      sendFamilyConnectionRequest({
        fromEmail: userEmail,
        fromName: "Your name",
        toEmail: person.email,
        senderRelation: relation,
        recipientRelation: getInverseRelation(relation),
        senderVisibility: visibility,
      });
    }

    onSendResult(`Requests sent to ${selectedPeople.length} person${selectedPeople.length === 1 ? "" : "s"}!`);
    onSentRequests(getSentFamilyRequests());

    setTimeout(() => {
      onStep(1);
      onLookupResult([]);
      onSelections({});
      onVisibility("conditions_only");
      onSendResult(null);
    }, 2000);
  };

  return (
    <div className="space-y-4">
      {step === 1 && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-xs mv-muted">
            <span className="font-medium text-[var(--fg)]">Enter their email address</span>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="their.email@example.com"
                value={email}
                onChange={(e) => {
                  onEmailChange(e.target.value);
                  onEmailError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleEmailLookup();
                  }
                }}
              />
              <Button className="shrink-0" onClick={handleEmailLookup}>
                Look up →
              </Button>
            </div>
          </label>
          {emailError && <p className="text-xs text-red-500">{emailError}</p>}

          {notOnPlatform && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-4 space-y-3">
              <p className="text-sm text-[var(--fg)]">
                No UMA account found for <span className="font-medium">{email}</span>
              </p>
              <p className="text-xs mv-muted">Send them an invite to sign up and join UMA.</p>
              <Button className="gap-2 w-full" onClick={handleSendInvite}>
                <Mail className="h-4 w-4" /> Send invite email
              </Button>
              <p className="text-xs mv-muted">They can sign up at uma.health</p>
              <Button
                variant="ghost"
                className="w-full text-xs"
                onClick={() => {
                  onEmailChange("");
                  onEmailError(null);
                  onNotOnPlatform(false);
                  onInviteSent(false);
                }}
              >
                Try another email
              </Button>
            </div>
          )}

          {inviteSent && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-green-800 font-medium">
                Invite sent! We will let them know you&apos;d like to connect.
              </p>
            </div>
          )}
        </div>
      )}

      {step === 2 && lookupResult.length > 0 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-[var(--fg)] mb-3">Select who you want to connect with:</p>
            <div className="space-y-2">
              {lookupResult.map((person) => {
                const personId = person.internalId;
                const isSelected = selections[personId]?.selected ?? false;
                return (
                  <div key={personId} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            onSelections({
                              ...selections,
                              [personId]: {
                                selected: e.target.checked,
                                relation: selections[personId]?.relation ?? null,
                              },
                            });
                          }}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-sm font-medium text-[var(--fg)]">{person.displayName}</span>
                        {person.isPrimary && (
                          <Badge className="text-[10px] bg-[var(--accent)]/20 text-[var(--accent)]">
                            Primary account
                          </Badge>
                        )}
                        {person.relation && <span className="text-[11px] mv-muted">(their relation: {person.relation})</span>}
                      </div>

                      {isSelected && (
                        <div className="ml-6 border-l border-[var(--border)] pl-3">
                          <div className="flex flex-col gap-1 text-xs mv-muted">
                            <span className="font-medium text-[var(--fg)]">Their relation to you</span>
                            <Select
                              value={selections[personId]?.relation || undefined}
                              onValueChange={(newRelation) => {
                                const relation = newRelation as FamilyRelation;
                                onSelections({
                                  ...selections,
                                  [personId]: {
                                    selected: true,
                                    relation,
                                  },
                                });
                                autoInferRelations(personId, relation);
                              }}
                            >
                              <SelectTrigger className="text-xs rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1.5 px-2 text-[var(--fg)]">
                                <SelectValue placeholder="Select relation" />
                              </SelectTrigger>
                              <SelectContent>
                                {RELATION_OPTIONS.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {FAMILY_RELATION_LABELS[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                onStep(1);
                onLookupResult([]);
                onSelections({});
              }}
            >
              Back
            </Button>
            <Button
              className="flex-1 text-xs"
              disabled={Object.values(selections).filter((s) => s.selected && s.relation).length === 0}
              onClick={() => onStep(3)}
            >
              Next: Permissions →
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-[var(--fg)] mb-2">Sending requests to:</p>
            <div className="space-y-1 mb-4">
              {Object.entries(selections)
                .filter(([_, s]) => s.selected && s.relation)
                .map(([personId, s]) => {
                  const person = lookupResult.find((p) => p.internalId === personId);
                  return (
                    <p key={personId} className="text-xs text-[var(--fg)]">
                      • {person?.displayName} ({FAMILY_RELATION_LABELS[s.relation!]})
                    </p>
                  );
                })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs mv-muted">
            <span className="font-medium text-[var(--fg)]">What can they see about you?</span>
            <Select
              value={visibility}
              onValueChange={(v) => onVisibility(v as FamilyLinkVisibility)}
            >
              <SelectTrigger className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)]">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full access (all health data)</SelectItem>
                <SelectItem value="conditions_only">Conditions only (allergies & conditions)</SelectItem>
                <SelectItem value="none">Private (nothing)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="text-xs" onClick={() => onStep(2)}>
              ← Back
            </Button>
            <Button className="flex-1 gap-2" onClick={handleSendConnectRequests}>
              <Send className="h-4 w-4" /> Send{" "}
              {Object.values(selections).filter((s) => s.selected && s.relation).length} request
              {Object.values(selections).filter((s) => s.selected && s.relation).length === 1 ? "" : "s"}
            </Button>
          </div>

          {sendResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-green-800 font-medium">{sendResult}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddMemberForm({
  name, relation, error,
  onNameChange, onRelationChange, onAdd, onCancel,
}: {
  name: string;
  relation: FamilyRelation;
  error: string | null;
  onNameChange: (v: string) => void;
  onRelationChange: (v: FamilyRelation) => void;
  onAdd: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] p-4 space-y-3">
      <p className="text-xs font-medium text-[var(--fg)]">
        {onCancel ? "Add another family member" : "Add your first family member"}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs mv-muted">
          <span>Name (as you call them)</span>
          <Input
            placeholder="e.g. Mum, Dad, Priya…"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          />
        </label>
        <div className="flex flex-col gap-1.5 text-xs mv-muted">
          <span>Relation to you</span>
          <Select
            value={relation}
            onValueChange={(v) => onRelationChange(v as FamilyRelation)}
          >
            <SelectTrigger className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)]">
              <SelectValue placeholder="Select relation" />
            </SelectTrigger>
            <SelectContent>
              {RELATION_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{FAMILY_RELATION_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" className="gap-2" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add {name.trim() || "family member"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function TagCombobox({
  value, onChange, onAdd, placeholder, suggestions, existing
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: (v: string) => void;
  placeholder: string;
  suggestions: string[];
  existing: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length > 0
    ? suggestions.filter(s =>
        s.toLowerCase().includes(value.toLowerCase()) &&
        !existing.includes(s)
      ).slice(0, 8)
    : [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); if (value.trim()) { onAdd(value); setOpen(false); } }
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <Button type="button" onClick={() => { if (value.trim()) { onAdd(value); setOpen(false); } }} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 z-40 mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow)] overflow-hidden">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onAdd(s); onChange(""); setOpen(false); }}
              className="w-full px-4 py-2 text-xs text-left hover:bg-[var(--panel-2)] text-[var(--fg)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState(() => getHydrationSafeViewingStore());
  const [rootStore, setRootStore] = useState(() => getHydrationSafeStore());
  const [activeMember, setActiveMemberState] = useState<FamilyMemberMeta | null>(null);
  const [allergyInput, setAllergyInput] = useState("");
  const [conditionInput, setConditionInput] = useState("");
  const [flowDateInput, setFlowDateInput] = useState("");
  // Family management
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRelation, setNewMemberRelation] = useState<FamilyRelation>("mother");
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberFormOpen, setAddMemberFormOpen] = useState(false);
  // Inline family member editing
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberFullName, setEditMemberFullName] = useState("");
  const [editMemberRelation, setEditMemberRelation] = useState<FamilyRelation>("other");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberPhone, setEditMemberPhone] = useState("");
  // Family Connections
  const [incomingRequests, setIncomingRequests] = useState<FamilyConnectionRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FamilyConnectionRequest[]>([]);
  const [familyLinks, setFamilyLinks] = useState<FamilyLink[]>([]);
  // Connect flow multi-step state
  const [connectStep, setConnectStep] = useState<1 | 2 | 3>(1);
  const [connectEmail, setConnectEmail] = useState("");
  const [connectEmailError, setConnectEmailError] = useState<string | null>(null);
  const [connectLookupResult, setConnectLookupResult] = useState<AccountRegistryEntry[]>([]);
  const [connectNotOnPlatform, setConnectNotOnPlatform] = useState(false);
  const [connectInviteSent, setConnectInviteSent] = useState(false);
  const [connectSelections, setConnectSelections] = useState<Record<string, { selected: boolean; relation: FamilyRelation | null }>>({});
  const [connectVisibility, setConnectVisibility] = useState<FamilyLinkVisibility>("conditions_only");
  const [connectSendResult, setConnectSendResult] = useState<string | null>(null);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [acceptVisibility, setAcceptVisibility] = useState<FamilyLinkVisibility>("conditions_only");
  // Phone & WhatsApp state
  const [phoneInput, setPhoneInput] = useState(store.profile.phone ?? "");
  // Sanitise the stored country code — the E164 regex in store.ts greedily captures up to 4 digits
  // which can produce codes like "+3168" (from "+31 68…") that don't exist in the list.
  // Fall back to "+91" (India) if the stored value isn't a known dial code.
  const sanitiseCountryCode = (raw: string | undefined) => {
    if (!raw) return "+91";
    const known = COUNTRY_CODES.find(c => c.dial === raw);
    if (known) return raw;
    // Try to find a known code that is a prefix of the raw value (e.g. "+31" from "+3168")
    const match = COUNTRY_CODES.find(c => raw.startsWith(c.dial));
    return match ? match.dial : "+91";
  };
  const [countryCodeInput, setCountryCodeInput] = useState(() => sanitiseCountryCode(store.profile.countryCode));
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneDraftDirty, setPhoneDraftDirty] = useState(false);
  const [waCodeInput, setWaCodeInput] = useState("");
  const [waCodeError, setWaCodeError] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waVerifying, setWaVerifying] = useState(false);
  // Country code dropdown state
  const [ccDropOpen, setCcDropOpen] = useState(false);
  const [ccSearch, setCcSearch] = useState("");
  const ccDropRef = useRef<HTMLDivElement>(null);
  const doctorNameSuggestions = useMemo(
    () => mergeDoctorQuickPick(store.profile, doctorNamesFromDocs(store.docs)),
    [
      store.docs,
      store.profile.primaryCareProvider,
      store.profile.doctorQuickPick,
      store.profile.doctorQuickPickHidden,
    ],
  );

  const facilityNameSuggestions = useMemo(
    () => mergeFacilityQuickPick(store.profile, facilityNamesFromDocs(store.docs)),
    [
      store.docs,
      store.profile.nextVisitHospital,
      store.profile.facilityQuickPick,
      store.profile.facilityQuickPickHidden,
    ],
  );

  const sexOptions = ["Male", "Female", "Prefer not to say"];

  useEffect(() => {
    function refresh() {
      const viewingStore = getViewingStore();
      setStore(viewingStore);
      setRootStore(getStore());
      setActiveMemberState(getActiveFamilyMember());
      const myEmail = viewingStore.profile.email ?? "";
      setIncomingRequests(getIncomingRequests(myEmail));
      setSentRequests(getSentFamilyRequests());
      setFamilyLinks(getFamilyLinks());
    }
    refresh();
    setHydrated(true);
    // The `focus` listener was a duplicate path with `mv-store-update` and is
    // dropped here for the same reason as the dashboard: every mutation already
    // dispatches mv-store-update synchronously, so the focus path was just
    // re-running expensive reads on every tab switch with no benefit.
    const onStoreUpdate = refresh;
    window.addEventListener("mv-store-update", onStoreUpdate as EventListener);
    window.addEventListener("mv-active-member-changed", onStoreUpdate as EventListener);
    return () => {
      window.removeEventListener("mv-store-update", onStoreUpdate as EventListener);
      window.removeEventListener("mv-active-member-changed", onStoreUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => {
    if (!ccDropOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (ccDropRef.current && !ccDropRef.current.contains(e.target as Node)) {
        setCcDropOpen(false);
        setCcSearch("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ccDropOpen]);

  useEffect(() => {
    if (!hydrated || phoneDraftDirty) return;
    setPhoneInput(store.profile.phone ?? "");
    setCountryCodeInput(sanitiseCountryCode(store.profile.countryCode));
  }, [hydrated, phoneDraftDirty, store.profile.phone, store.profile.countryCode]);

  useEffect(() => {
    if (!hydrated) return;
    if (store.profile.countryCode) return; // already saved
    const lang = navigator.language ?? "";
    const map: Record<string, string> = {
      "en-IN": "+91", "hi": "+91", "hi-IN": "+91",
      "en-US": "+1", "en-CA": "+1",
      "en-GB": "+44",
      "en-AU": "+61",
      "en-AE": "+971",
      "ar-AE": "+971",
    };
    const guess = map[lang] ?? map[lang.split("-")[0]];
    if (guess) setCountryCodeInput(guess);
  }, [hydrated]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearLocalPatientStore();
    window.location.href = "/login";
  }

  function updateProfile(patch: Partial<typeof store.profile>) {
    const next = { ...store, profile: { ...store.profile, ...patch } };
    setStore(next);
    saveViewingStore(next);
  }

  function removeDoctorSuggestion(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const qp = store.profile.doctorQuickPick ?? [];
    const inCustom = qp.some((x) => normPickKey(x) === normPickKey(trimmed));
    const profile = { ...store.profile };
    if (inCustom) {
      profile.doctorQuickPick = qp.filter((x) => normPickKey(x) !== normPickKey(trimmed));
    } else {
      const hidden = new Set([...(profile.doctorQuickPickHidden ?? [])]);
      hidden.add(normPickKey(trimmed));
      profile.doctorQuickPickHidden = [...hidden];
    }
    const next = { ...store, profile };
    setStore(next);
    saveViewingStore(next);
  }

  function appendDoctorQuickPick(name: string) {
    const t = name.trim();
    if (!t) return;
    const qp = [...(store.profile.doctorQuickPick ?? [])];
    if (qp.some((x) => normPickKey(x) === normPickKey(t))) return;
    qp.push(t);
    const next = { ...store, profile: { ...store.profile, doctorQuickPick: qp } };
    setStore(next);
    saveViewingStore(next);
  }

  function renameDoctorSuggestion(from: string, to: string) {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t || normPickKey(f) === normPickKey(t)) return;
    const profile = { ...store.profile };
    const qp = [...(profile.doctorQuickPick ?? [])];
    const idx = qp.findIndex((x) => normPickKey(x) === normPickKey(f));
    if (idx >= 0) {
      qp[idx] = t;
      profile.doctorQuickPick = qp;
    } else {
      const hidden = new Set([...(profile.doctorQuickPickHidden ?? [])]);
      hidden.add(normPickKey(f));
      profile.doctorQuickPickHidden = [...hidden];
      if (!qp.some((x) => normPickKey(x) === normPickKey(t))) qp.push(t);
      profile.doctorQuickPick = qp;
    }
    if (normPickKey(store.profile.primaryCareProvider ?? "") === normPickKey(f)) {
      profile.primaryCareProvider = t;
    }
    const next = { ...store, profile };
    setStore(next);
    saveViewingStore(next);
  }

  function removeFacilitySuggestion(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const qp = store.profile.facilityQuickPick ?? [];
    const inCustom = qp.some((x) => normPickKey(x) === normPickKey(trimmed));
    const profile = { ...store.profile };
    if (inCustom) {
      profile.facilityQuickPick = qp.filter((x) => normPickKey(x) !== normPickKey(trimmed));
    } else {
      const hidden = new Set([...(profile.facilityQuickPickHidden ?? [])]);
      hidden.add(normPickKey(trimmed));
      profile.facilityQuickPickHidden = [...hidden];
    }
    const next = { ...store, profile };
    setStore(next);
    saveViewingStore(next);
  }

  function appendFacilityQuickPick(name: string) {
    const t = name.trim();
    if (!t) return;
    const qp = [...(store.profile.facilityQuickPick ?? [])];
    if (qp.some((x) => normPickKey(x) === normPickKey(t))) return;
    qp.push(t);
    const next = { ...store, profile: { ...store.profile, facilityQuickPick: qp } };
    setStore(next);
    saveViewingStore(next);
  }

  function renameFacilitySuggestion(from: string, to: string) {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t || normPickKey(f) === normPickKey(t)) return;
    const profile = { ...store.profile };
    const qp = [...(profile.facilityQuickPick ?? [])];
    const idx = qp.findIndex((x) => normPickKey(x) === normPickKey(f));
    if (idx >= 0) {
      qp[idx] = t;
      profile.facilityQuickPick = qp;
    } else {
      const hidden = new Set([...(profile.facilityQuickPickHidden ?? [])]);
      hidden.add(normPickKey(f));
      profile.facilityQuickPickHidden = [...hidden];
      if (!qp.some((x) => normPickKey(x) === normPickKey(t))) qp.push(t);
      profile.facilityQuickPick = qp;
    }
    if (normPickKey(store.profile.nextVisitHospital ?? "") === normPickKey(f)) {
      profile.nextVisitHospital = t;
    }
    const next = { ...store, profile };
    setStore(next);
    saveViewingStore(next);
  }

  function updateBodyMetrics(patch: Partial<NonNullable<typeof store.profile.bodyMetrics>>) {
    updateProfile({
      bodyMetrics: { ...(store.profile.bodyMetrics ?? {}), ...patch },
    });
  }

  function updateMenstrualCycle(patch: Partial<NonNullable<typeof store.profile.menstrualCycle>>) {
    const cur = store.profile.menstrualCycle ?? { flowLogDates: [] };
    updateProfile({
      menstrualCycle: {
        ...cur,
        ...patch,
        flowLogDates: patch.flowLogDates ?? cur.flowLogDates ?? [],
      },
    });
  }

  function addFlowDay() {
    const d = flowDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const cur = store.profile.menstrualCycle?.flowLogDates ?? [];
    if (cur.includes(d)) return setFlowDateInput("");
    updateMenstrualCycle({ flowLogDates: [...cur, d].sort() });
    setFlowDateInput("");
  }

  function removeFlowDay(d: string) {
    const cur = store.profile.menstrualCycle?.flowLogDates ?? [];
    updateMenstrualCycle({ flowLogDates: cur.filter((x) => x !== d) });
  }

  function saveIdentity(first?: string, last?: string) {
    const firstTrimmed = (first ?? "").trim();
    const lastTrimmed = (last ?? "").trim();
    const full = [firstTrimmed, lastTrimmed].filter(Boolean).join(" ").trim();
    // Always persist strings (never undefined) so JSON/localStorage keeps keys and getStore() does not drop fields.
    updateProfile({
      firstName: firstTrimmed,
      lastName: lastTrimmed,
      name: full,
    });
  }

  function addAllergy() {
    const value = allergyInput.trim();
    if (!value) return;
    if (store.profile.allergies.includes(value)) return setAllergyInput("");
    updateProfile({ allergies: [...store.profile.allergies, value] });
    setAllergyInput("");
  }

  function addCondition() {
    const value = conditionInput.trim();
    if (!value) return;
    if (store.profile.conditions.includes(value)) return setConditionInput("");
    updateProfile({ conditions: [...store.profile.conditions, value] });
    setConditionInput("");
  }

  function removeAllergy(value: string) {
    updateProfile({ allergies: store.profile.allergies.filter((a) => a !== value) });
  }

  function removeCondition(value: string) {
    updateProfile({ conditions: store.profile.conditions.filter((c) => c !== value) });
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppTopNav
        rightSlot={
          <Button variant="ghost" className="gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 pb-12">
        <div className="grid gap-4">
          <Card id="profile-patient-details" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Your details</h2>
                <Badge suppressHydrationWarning>{hydrated ? ([store.profile.firstName, store.profile.lastName].filter(Boolean).join(" ") || store.profile.name) : ""}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 md:items-start">
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">First name(s)</span>
                  <Input
                    value={store.profile.firstName ?? ""}
                    onChange={(e) => saveIdentity(e.target.value, store.profile.lastName)}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Last name</span>
                  <Input
                    value={store.profile.lastName ?? ""}
                    onChange={(e) => saveIdentity(store.profile.firstName, e.target.value)}
                  />
                </label>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Date of birth</span>
                  <DatePicker
                    value={store.profile.dob ?? ""}
                    onChange={(v) => updateProfile({ dob: v })}
                    placeholder="Pick date of birth"
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Sex</span>
                  <Select
                    value={store.profile.sex || undefined}
                    onValueChange={(v) => updateProfile({ sex: v || undefined })}
                  >
                    <SelectTrigger className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)]">
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      {sexOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Email</span>
                  <Input
                    type="email"
                    value={store.profile.email ?? ""}
                    onChange={(e) => updateProfile({ email: e.target.value })}
                  />
                </label>
                {/* ── Phone number ── */}
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Mobile number</span>
                  <div className="flex gap-2">
                    {/* Searchable country code dropdown — only rendered client-side to avoid hydration mismatch */}
                    <div className="relative shrink-0" ref={ccDropRef}>
                      {!hydrated ? (
                        <div className="flex items-center gap-1.5 h-10 px-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] text-sm text-[var(--fg)] whitespace-nowrap w-20" />
                      ) : (
                      <button
                        type="button"
                        onClick={() => { setCcDropOpen(!ccDropOpen); setCcSearch(""); }}
                        className="flex items-center gap-1.5 h-10 px-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] text-sm text-[var(--fg)] hover:border-[var(--accent)]/50 transition-colors whitespace-nowrap"
                        aria-haspopup="listbox"
                        aria-expanded={ccDropOpen}
                      >
                        {COUNTRY_CODES.find(c => c.dial === countryCodeInput)?.flag ?? "🌐"}{" "}
                        {countryCodeInput}
                        <svg className="h-3 w-3 text-[var(--muted)] ml-0.5" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                        </svg>
                      </button>
                      )}
                      {ccDropOpen && (
                        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow)] overflow-hidden">
                          <div className="p-2 border-b border-[var(--border)]">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search country or code…"
                              value={ccSearch}
                              onChange={e => setCcSearch(e.target.value)}
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs text-[var(--fg)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {COUNTRY_CODES
                              .filter(c => {
                                const q = ccSearch.toLowerCase();
                                return !q || c.name.toLowerCase().includes(q) || c.dial.includes(q);
                              })
                              .map(c => (
                                <button
                                  key={c.dial}
                                  type="button"
                                  onClick={() => {
                                    setCountryCodeInput(c.dial);
                                    setCcDropOpen(false);
                                    setCcSearch("");
                                    setPhoneSaved(false);
                                    setPhoneDraftDirty(true);
                                  }}
                                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--panel-2)] ${countryCodeInput === c.dial ? "bg-[var(--accent)]/8 text-[var(--accent)]" : "text-[var(--fg)]"}`}
                                >
                                  <span className="text-base shrink-0">{c.flag}</span>
                                  <span className="font-medium shrink-0">{c.dial}</span>
                                  <span className="text-[var(--muted)] truncate">{c.name}</span>
                                </button>
                              ))
                            }
                          </div>
                        </div>
                      )}
                    </div>
                    <Input
                      inputMode="numeric"
                      placeholder="Phone number"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value.replace(/\D/g, ""));
                        setPhoneSaved(false);
                        setPhoneDraftDirty(true);
                      }}
                      className="flex-1"
                    />
                    {/* Verify button — only shown when there's a number and it's not already verified */}
                    {hydrated && phoneInput.trim() && !store.profile.whatsappVerified && (
                      <button
                        type="button"
                        onClick={() => setShowOtpModal(true)}
                        className="shrink-0 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent)]/8 px-3 py-2 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-colors"
                      >
                        Verify
                      </button>
                    )}
                    {hydrated && store.profile.whatsappVerified && (
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <Check className="h-3.5 w-3.5" /> Verified
                        </span>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:underline"
                          onClick={async () => {
                            try {
                              await fetch("/api/whatsapp/link", { method: "DELETE" });
                            } catch {
                              /* ignore */
                            }
                            updateProfile({ whatsappVerified: false, whatsappPhone: undefined });
                          }}
                        >
                          Unlink
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Save button — only shown when input differs from saved */}
                  {(phoneInput !== (store.profile.phone ?? "") || countryCodeInput !== (store.profile.countryCode ?? "+91")) && phoneInput.trim() && (
                    <button
                      type="button"
                      className="self-start text-xs text-[var(--accent)] hover:underline"
                      onClick={() => {
                        updateProfile({ phone: phoneInput, countryCode: countryCodeInput });
                        setPhoneSaved(true);
                        setPhoneDraftDirty(false);
                      }}
                    >
                      Save number
                    </button>
                  )}
                  {phoneSaved && (
                    <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Regular doctor</span>
                  <Combobox
                    value={store.profile.primaryCareProvider ?? ""}
                    onChange={(v) =>
                      updateProfile({ primaryCareProvider: v.trim() || undefined })
                    }
                    suggestions={hydrated ? doctorNameSuggestions : []}
                    placeholder={
                      hydrated && doctorNameSuggestions.length > 0
                        ? "Pick, edit, or remove names — save your own to the list"
                        : "Your doctor's name (optional)"
                    }
                    onRemoveSuggestion={hydrated ? removeDoctorSuggestion : undefined}
                    onRenameSuggestion={hydrated ? renameDoctorSuggestion : undefined}
                    onAppendCustom={hydrated ? appendDoctorQuickPick : undefined}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Next doctor visit</span>
                  <DatePicker
                    value={store.profile.nextVisitDate ?? ""}
                    onChange={(v) => updateProfile({ nextVisitDate: v || undefined })}
                    placeholder="Pick visit date"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Hospital / Clinic</span>
                  <Combobox
                    value={store.profile.nextVisitHospital ?? ""}
                    onChange={(v) =>
                      updateProfile({ nextVisitHospital: v.trim() || undefined })
                    }
                    suggestions={hydrated ? facilityNameSuggestions : []}
                    placeholder={
                      hydrated && facilityNameSuggestions.length > 0
                        ? "Pick, edit, or remove — save your own to the list"
                        : "Hospital or clinic name"
                    }
                    onRemoveSuggestion={hydrated ? removeFacilitySuggestion : undefined}
                    onRenameSuggestion={hydrated ? renameFacilitySuggestion : undefined}
                    onAppendCustom={hydrated ? appendFacilityQuickPick : undefined}
                  />
                </div>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted md:col-span-2">
                  <span className="leading-tight">Private notes</span>
                  <Input
                    value={store.profile.notes ?? ""}
                    onChange={(e) => updateProfile({ notes: e.target.value })}
                    placeholder="Things to remember for visits, questions for your doctor, etc."
                  />
                </label>
              </div>
            </CardContent>
          </Card>

        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className={store.profile.sex !== "Female" ? "lg:col-span-2" : ""}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-medium">Height and weight</h2>
              </div>
              <p className="text-xs mv-muted mt-1">
                Optional. Values are saved in metric (cm / kg); pick the units you prefer to type in — SI units are the default.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span>Height</span>
                  <div className="flex h-10 w-full items-center rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                    <input
                      className="h-full min-w-0 flex-1 rounded-l-2xl bg-transparent px-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
                      inputMode="decimal"
                      placeholder={store.profile.bodyMetrics?.heightUnit === "in" ? "e.g. 65" : "e.g. 165"}
                      value={cmToLengthDisplay(
                        store.profile.bodyMetrics?.heightCm,
                        store.profile.bodyMetrics?.heightUnit ?? "cm"
                      )}
                      onChange={(e) =>
                        updateBodyMetrics({
                          heightCm:
                            parseLengthToCm(
                              e.target.value,
                              store.profile.bodyMetrics?.heightUnit ?? "cm"
                            ),
                        })
                      }
                    />
                    <Select
                      value={store.profile.bodyMetrics?.heightUnit ?? "cm"}
                      onValueChange={(v) =>
                        updateBodyMetrics({ heightUnit: v as "cm" | "in" })
                      }
                    >
                      <SelectTrigger
                        className="uma-select shrink-0 rounded-none rounded-r-[15px] bg-[var(--panel)] px-2 text-xs text-[var(--muted)]"
                        style={{
                          height: "100%",
                          width: "auto",
                          border: "none",
                          borderLeft: "1px solid var(--border)",
                          gap: 4,
                          boxShadow: "none",
                        }}
                      >
                        {store.profile.bodyMetrics?.heightUnit ?? "cm"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span>Weight</span>
                  <div className="flex h-10 w-full items-center rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                    <input
                      className="h-full min-w-0 flex-1 rounded-l-2xl bg-transparent px-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
                      inputMode="decimal"
                      placeholder={store.profile.bodyMetrics?.weightUnit === "lb" ? "e.g. 150" : "e.g. 62"}
                      value={kgToWeightDisplay(
                        store.profile.bodyMetrics?.weightKg,
                        store.profile.bodyMetrics?.weightUnit ?? "kg"
                      )}
                      onChange={(e) =>
                        updateBodyMetrics({
                          weightKg:
                            parseWeightToKg(
                              e.target.value,
                              store.profile.bodyMetrics?.weightUnit ?? "kg"
                            ),
                        })
                      }
                    />
                    <Select
                      value={store.profile.bodyMetrics?.weightUnit ?? "kg"}
                      onValueChange={(v) =>
                        updateBodyMetrics({ weightUnit: v as "kg" | "lb" })
                      }
                    >
                      <SelectTrigger
                        className="uma-select shrink-0 rounded-none rounded-r-[15px] bg-[var(--panel)] px-2 text-xs text-[var(--muted)]"
                        style={{
                          height: "100%",
                          width: "auto",
                          border: "none",
                          borderLeft: "1px solid var(--border)",
                          gap: 4,
                          boxShadow: "none",
                        }}
                      >
                        {store.profile.bodyMetrics?.weightUnit ?? "kg"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="lb">lb</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span>Waist</span>
                  <div className="flex h-10 w-full items-center rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                    <input
                      className="h-full min-w-0 flex-1 rounded-l-2xl bg-transparent px-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
                      inputMode="decimal"
                      placeholder="Optional"
                      value={cmToLengthDisplay(
                        store.profile.bodyMetrics?.waistCm,
                        store.profile.bodyMetrics?.waistUnit ?? "cm"
                      )}
                      onChange={(e) =>
                        updateBodyMetrics({
                          waistCm:
                            parseLengthToCm(
                              e.target.value,
                              store.profile.bodyMetrics?.waistUnit ?? "cm"
                            ),
                        })
                      }
                    />
                    <Select
                      value={store.profile.bodyMetrics?.waistUnit ?? "cm"}
                      onValueChange={(v) =>
                        updateBodyMetrics({ waistUnit: v as "cm" | "in" })
                      }
                    >
                      <SelectTrigger
                        className="uma-select shrink-0 rounded-none rounded-r-[15px] bg-[var(--panel)] px-2 text-xs text-[var(--muted)]"
                        style={{
                          height: "100%",
                          width: "auto",
                          border: "none",
                          borderLeft: "1px solid var(--border)",
                          gap: 4,
                          boxShadow: "none",
                        }}
                      >
                        {store.profile.bodyMetrics?.waistUnit ?? "cm"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-[11px] mv-muted lg:col-span-3">
                  Log your blood pressure readings over time from the dashboard&apos;s Health log
                  section — it tracks each reading with date, pulse, and notes.
                </div>
              </div>
            </CardContent>
          </Card>

          {store.profile.sex === "Female" && (
            <Card id="profile-cycle-tracking" className="scroll-mt-24">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-[var(--accent-2)]" />
                  <h2 className="text-sm font-medium">Period tracker</h2>
                </div>
                <p className="text-xs mv-muted mt-1">
                  Estimates only — predictions are based on your average cycle. Speak to your doctor about symptoms or irregular cycles.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                    <span className="leading-tight">Cycle length (days)</span>
                    <Input
                      type="number"
                      min={21}
                      max={45}
                      className="w-full"
                      value={store.profile.menstrualCycle?.typicalCycleLengthDays ?? 28}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (!Number.isFinite(n)) return;
                        updateMenstrualCycle({ typicalCycleLengthDays: Math.min(45, Math.max(21, n)) });
                      }}
                    />
                    <span className="text-[10px] mv-muted">From first day of one period to first day of next</span>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                    <span className="leading-tight">Period length (days)</span>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="w-full"
                      value={store.profile.menstrualCycle?.periodLengthDays ?? 5}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        if (!Number.isFinite(n)) return;
                        updateMenstrualCycle({ periodLengthDays: Math.min(10, Math.max(1, n)) });
                      }}
                    />
                    <span className="text-[10px] mv-muted">How many days your period usually lasts</span>
                  </label>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">First day of your last period</span>
                  <DatePicker
                    className="max-w-[220px]"
                    value={store.profile.menstrualCycle?.lastPeriodStartISO ?? ""}
                    onChange={(v) =>
                      updateMenstrualCycle({ lastPeriodStartISO: v || undefined })
                    }
                    placeholder="Pick date"
                    max={new Date().toISOString().slice(0, 10)}
                  />
                  <span className="text-[10px] mv-muted">Used to predict your next period, ovulation, and fertile window</span>
                </div>
                <div className="flex min-w-0 flex-col gap-2 border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-medium text-[var(--fg)] leading-tight">Log a flow day</p>
                  <p className="text-[11px] leading-relaxed mv-muted">
                    Mark days when you have your period. This helps track your actual cycle over time.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <DatePicker
                      className="max-w-[220px]"
                      value={flowDateInput}
                      onChange={(v) => setFlowDateInput(v)}
                      placeholder="Pick a date"
                      max={new Date().toISOString().slice(0, 10)}
                    />
                    <Button type="button" className="h-10 shrink-0 gap-2" onClick={addFlowDay}>
                      <Plus className="h-4 w-4" /> Log day
                    </Button>
                  </div>
                  <div className="flex min-h-[2.5rem] flex-wrap gap-2 mt-1">
                    {(store.profile.menstrualCycle?.flowLogDates ?? [])
                      .slice()
                      .sort()
                      .reverse()
                      .map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs hover:bg-[var(--border)] transition-colors"
                          onClick={() => removeFlowDay(d)}
                        >
                          <Droplets className="h-3 w-3 text-[var(--accent-2)]" />
                          {d} <span className="text-[10px] mv-muted">×</span>
                        </button>
                      ))}
                    {!store.profile.menstrualCycle?.flowLogDates?.length && (
                      <span className="self-center text-sm mv-muted py-1">No flow days logged yet.</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card id="profile-allergies" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Allergies</h2>
                <Badge>{store.profile.allergies.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <TagCombobox
                  value={allergyInput}
                  onChange={setAllergyInput}
                  onAdd={v => { const trimmed = v.trim(); if (trimmed && !store.profile.allergies.includes(trimmed)) { updateProfile({ allergies: [...store.profile.allergies, trimmed] }); } setAllergyInput(""); }}
                  placeholder="Type an allergy…"
                  suggestions={COMMON_ALLERGIES}
                  existing={store.profile.allergies}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {store.profile.allergies.map((a) => (
                  <button
                    key={a}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs"
                    onClick={() => removeAllergy(a)}
                  >
                    {a} <span className="text-[10px] mv-muted">remove</span>
                  </button>
                ))}
                {!store.profile.allergies.length && <p className="text-sm mv-muted">No allergies listed yet.</p>}
              </div>
            </CardContent>
          </Card>

          <Card id="profile-conditions" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Medical history & symptoms</h2>
                <Badge>{store.profile.conditions.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <TagCombobox
                  value={conditionInput}
                  onChange={setConditionInput}
                  onAdd={v => { const trimmed = v.trim(); if (trimmed && !store.profile.conditions.includes(trimmed)) { updateProfile({ conditions: [...store.profile.conditions, trimmed] }); } setConditionInput(""); }}
                  placeholder="Symptoms, diagnoses, past events…"
                  suggestions={COMMON_CONDITIONS}
                  existing={store.profile.conditions}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {store.profile.conditions.map((c) => (
                  <button
                    key={c}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs"
                    onClick={() => removeCondition(c)}
                  >
                    {c} <span className="text-[10px] mv-muted">remove</span>
                  </button>
                ))}
                {!store.profile.conditions.length && <p className="text-sm mv-muted">No health issues listed yet.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Insurance — always shown ── */}
        <InsuranceSection store={store} onStoreChange={() => window.dispatchEvent(new Event("mv-store-update"))} />

        {/* ── Family profiles — only shown for the primary account holder ── */}
        {!activeMember && (
          <Card id="profile-family" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-medium">Family profiles</h2>
                {(rootStore.familyMembers ?? []).length > 0 && (
                  <Badge>{(rootStore.familyMembers ?? []).length}</Badge>
                )}
              </div>
              <p className="text-xs mv-muted mt-1">
                Add family members to manage their health records separately under the same account. Each person&apos;s data is fully isolated.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* "Add another" button at TOP */}
              {(rootStore.familyMembers ?? []).length > 0 && (
                !addMemberFormOpen ? (
                  <button
                    type="button"
                    onClick={() => setAddMemberFormOpen(true)}
                    className="flex items-center gap-2 text-xs text-[var(--accent)] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add another family member
                  </button>
                ) : (
                  <AddMemberForm
                    name={newMemberName}
                    relation={newMemberRelation}
                    error={addMemberError}
                    onNameChange={(v) => { setNewMemberName(v); setAddMemberError(null); }}
                    onRelationChange={setNewMemberRelation}
                    onAdd={() => {
                      const name = newMemberName.trim();
                      if (!name) { setAddMemberError("Please enter a name."); return; }
                      addFamilyMember({ relation: newMemberRelation, displayName: name });
                      setNewMemberName("");
                      setNewMemberRelation("mother");
                      setAddMemberError(null);
                      setAddMemberFormOpen(false);
                      setRootStore(getStore());
                    }}
                    onCancel={() => { setAddMemberFormOpen(false); setAddMemberError(null); }}
                  />
                )
              )}

              {/* Existing member list */}
              {(rootStore.familyMembers ?? []).length > 0 && (
                <div className="space-y-2">
                    {(rootStore.familyMembers ?? []).map((m) => {
                      const isEditing = editingMemberId === m.id;
                      return (
                        <div key={m.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)]">
                          {/* collapsed row */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            <span className="text-xl shrink-0" aria-hidden>{RELATION_EMOJI[m.relation] ?? "🧑"}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[var(--fg)]">{m.fullName || m.displayName}</p>
                              {m.fullName && m.displayName !== m.fullName && (
                                <p className="text-[11px] mv-muted">&ldquo;{m.displayName}&rdquo;</p>
                              )}
                              <p className="text-xs mv-muted">{FAMILY_RELATION_LABELS[m.relation]}{m.linkedEmail ? ` · ${m.linkedEmail}` : ""}</p>
                            </div>
                            <button
                              type="button"
                              className="h-8 px-3 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--fg)]/30 transition-colors shrink-0"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingMemberId(null);
                                } else {
                                  setEditingMemberId(m.id);
                                  setEditMemberName(m.displayName);
                                  setEditMemberFullName(m.fullName ?? "");
                                  setEditMemberRelation(m.relation);
                                  setEditMemberEmail(m.linkedEmail ?? "");
                                  setEditMemberPhone(m.linkedPhone ?? "");
                                }
                              }}
                            >
                              {isEditing ? "Cancel" : "Edit"}
                            </button>
                            <Button
                              variant="ghost"
                              className="h-8 px-3 text-xs gap-1.5 shrink-0"
                              onClick={() => {
                                setActiveFamilyMember(m.id);
                                window.location.href = "/dashboard";
                              }}
                            >
                              View →
                            </Button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Remove ${m.displayName}'s profile? This permanently deletes all their data.`)) {
                                  removeFamilyMember(m.id);
                                  setRootStore(getStore());
                                  if (editingMemberId === m.id) setEditingMemberId(null);
                                }
                              }}
                              className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:text-red-500 grid place-items-center transition-colors shrink-0"
                              aria-label={`Remove ${m.displayName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* inline edit panel */}
                          {isEditing && (
                            <div className="border-t border-[var(--border)] px-4 py-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="flex flex-col gap-1.5 text-xs mv-muted">
                                Nickname (how you call them)
                                <Input
                                  value={editMemberName}
                                  onChange={(e) => setEditMemberName(e.target.value)}
                                  placeholder="e.g. Mum, Dad, Priya"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 text-xs mv-muted">
                                Full name
                                <Input
                                  value={editMemberFullName}
                                  onChange={(e) => setEditMemberFullName(e.target.value)}
                                  placeholder="e.g. Rajesh Kumar"
                                />
                              </label>
                              <div className="flex flex-col gap-1.5 text-xs mv-muted">
                                Relation to you
                                <Select
                                  value={editMemberRelation}
                                  onValueChange={(v) => setEditMemberRelation(v as FamilyRelation)}
                                >
                                  <SelectTrigger className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2 text-sm text-[var(--fg)]">
                                    <SelectValue placeholder="Select relation" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {RELATION_OPTIONS.map((r) => (
                                      <SelectItem key={r} value={r}>{FAMILY_RELATION_LABELS[r]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <label className="flex flex-col gap-1.5 text-xs mv-muted">
                                Their UMA account email
                                <Input
                                  type="email"
                                  value={editMemberEmail}
                                  onChange={(e) => setEditMemberEmail(e.target.value)}
                                  placeholder="their@email.com"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 text-xs mv-muted sm:col-span-2">
                                Their phone number
                                <Input
                                  type="tel"
                                  value={editMemberPhone}
                                  onChange={(e) => setEditMemberPhone(e.target.value)}
                                  placeholder="+91 98765 43210"
                                />
                              </label>
                              <div className="sm:col-span-2 flex gap-2">
                                <Button
                                  className="gap-2"
                                  onClick={() => {
                                    if (!editMemberName.trim()) return;
                                    updateFamilyMemberMeta(m.id, {
                                      displayName: editMemberName.trim(),
                                      fullName: editMemberFullName.trim() || undefined,
                                      relation: editMemberRelation,
                                      linkedEmail: editMemberEmail.trim() || undefined,
                                      linkedPhone: editMemberPhone.trim() || undefined,
                                    });
                                    setRootStore(getStore());
                                    setEditingMemberId(null);
                                  }}
                                >
                                  <Check className="h-4 w-4" /> Save changes
                                </Button>
                                <Button variant="ghost" onClick={() => setEditingMemberId(null)}>Cancel</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
              )}

              {/* Empty state — show full add form immediately */}
              {(rootStore.familyMembers ?? []).length === 0 && (
                <AddMemberForm
                  name={newMemberName}
                  relation={newMemberRelation}
                  error={addMemberError}
                  onNameChange={(v) => { setNewMemberName(v); setAddMemberError(null); }}
                  onRelationChange={setNewMemberRelation}
                  onAdd={() => {
                    const name = newMemberName.trim();
                    if (!name) { setAddMemberError("Please enter a name."); return; }
                    addFamilyMember({ relation: newMemberRelation, displayName: name });
                    setNewMemberName("");
                    setNewMemberRelation("mother");
                    setAddMemberError(null);
                    setRootStore(getStore());
                  }}
                />
              )}

            </CardContent>
          </Card>
        )}

        {!activeMember && (
          <Card id="profile-family-connections" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-medium">Family Connections</h2>
              </div>
              <p className="text-xs mv-muted mt-1">
                Connect with family members on other accounts and share health information securely.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Section 1: Linked accounts — hidden if empty (Connect section below covers it) */}
              {familyLinks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--fg)] mb-3">Linked accounts</p>
                <div className="space-y-4">
                  {(
                    familyLinks.map((link) => (
                      <div
                        key={link.id}
                        className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--fg)]">{link.linkedAccountName}</p>
                            <p className="text-xs mv-muted">{FAMILY_RELATION_LABELS[link.relation]}</p>
                            <p className="text-xs mv-muted break-all">{link.linkedAccountEmail}</p>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Select
                              value={link.myVisibility}
                              onValueChange={(newVis) => {
                                const vis = newVis as FamilyLinkVisibility;
                                const updated = familyLinks.map((l) =>
                                  l.id === link.id ? { ...l, myVisibility: vis } : l
                                );
                                setFamilyLinks(updated);
                                try {
                                  const storeRaw = localStorage.getItem("mv_patient_store_v1");
                                  if (storeRaw) {
                                    const s = JSON.parse(storeRaw);
                                    s.familyLinks = updated;
                                    s.updatedAtISO = new Date().toISOString();
                                    localStorage.setItem("mv_patient_store_v1", JSON.stringify(s));
                                    window.dispatchEvent(new CustomEvent("mv-store-update", { detail: s }));
                                  }
                                } catch {
                                  // Ignore
                                }
                              }}
                            >
                              <SelectTrigger className="text-xs rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1.5 px-2 text-[var(--fg)]">
                                <SelectValue placeholder="Select visibility" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full">Full access</SelectItem>
                                <SelectItem value="conditions_only">Conditions only</SelectItem>
                                <SelectItem value="none">Private</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              className="text-xs h-8 text-red-500 hover:text-red-600"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Disconnect ${link.linkedAccountName}? They will no longer see your health information.`
                                  )
                                ) {
                                  removeFamilyLink(link.id);
                                  setFamilyLinks(familyLinks.filter((l) => l.id !== link.id));
                                }
                              }}
                            >
                              Disconnect
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              )}

              {/* Section 2: Requests */}
              <div>
                <p className="text-xs font-semibold text-[var(--fg)] mb-3">Requests</p>
                <div className="space-y-6">
                  {/* Incoming requests */}
                  <div>
                    <p className="text-sm font-medium text-[var(--fg)] mb-3">Requests from others</p>
                    {incomingRequests.filter((r) => r.status === "pending").length === 0 ? (
                      <p className="text-xs mv-muted">No pending requests.</p>
                    ) : (
                      <div className="space-y-3">
                        {incomingRequests
                          .filter((r) => r.status === "pending")
                          .map((req) => (
                            <div
                              key={req.id}
                              className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4"
                            >
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--fg)]">{req.fromAccountName}</p>
                                  <p className="text-xs mv-muted">{FAMILY_RELATION_LABELS[req.recipientRelation]}</p>
                                  <p className="text-xs mv-muted break-all">{req.fromAccountEmail}</p>
                                  <p className="text-xs mv-muted mt-2">
                                    They allow you to see:{" "}
                                    {req.senderVisibility === "full"
                                      ? "Full access"
                                      : req.senderVisibility === "conditions_only"
                                        ? "Conditions only"
                                        : "Private"}
                                  </p>
                                </div>
                              </div>
                              {acceptingRequestId === req.id ? (
                                <div className="space-y-3 border-t border-[var(--border)] pt-3">
                                  <div className="flex flex-col gap-1.5 text-xs mv-muted">
                                    <span>What can they see about you?</span>
                                    <Select
                                      value={acceptVisibility}
                                      onValueChange={(v) => setAcceptVisibility(v as FamilyLinkVisibility)}
                                    >
                                      <SelectTrigger className="rounded-lg border border-[var(--border)] bg-[var(--panel)] py-2 text-sm text-[var(--fg)]">
                                        <SelectValue placeholder="Select visibility" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="full">Full access</SelectItem>
                                        <SelectItem value="conditions_only">Conditions only</SelectItem>
                                        <SelectItem value="none">Private</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      className="text-xs h-8 gap-1.5"
                                      onClick={() => {
                                        acceptFamilyRequest(req, store.profile.name || "", acceptVisibility);
                                        setIncomingRequests(incomingRequests.filter((r) => r.id !== req.id));
                                        setFamilyLinks(getFamilyLinks());
                                        setAcceptingRequestId(null);
                                        setAcceptVisibility("conditions_only");
                                      }}
                                    >
                                      <UserCheck className="h-3.5 w-3.5" /> Confirm
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      className="text-xs h-8"
                                      onClick={() => {
                                        setAcceptingRequestId(null);
                                        setAcceptVisibility("conditions_only");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Button
                                    className="text-xs h-8 gap-1.5"
                                    onClick={() => setAcceptingRequestId(req.id)}
                                  >
                                    <UserCheck className="h-3.5 w-3.5" /> Accept
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="text-xs h-8 text-red-500 hover:text-red-600 gap-1.5"
                                    onClick={() => {
                                      rejectFamilyRequest(req);
                                      setIncomingRequests(incomingRequests.filter((r) => r.id !== req.id));
                                    }}
                                  >
                                    <UserX className="h-3.5 w-3.5" /> Decline
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Sent requests — only shown when there are any */}
                  {sentRequests.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-[var(--fg)] mb-3">Sent by me</p>
                      <div className="space-y-3">
                        {sentRequests.map((req) => (
                          <div
                            key={req.id}
                            className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-[var(--fg)]">{req.toAccountEmail}</p>
                                <p className="text-xs mv-muted">{FAMILY_RELATION_LABELS[req.senderRelation]}</p>
                                <p className="text-xs mv-muted mt-2">
                                  Status:{" "}
                                  <Badge
                                    className={
                                      req.status === "pending"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : req.status === "accepted"
                                          ? "bg-green-100 text-green-800"
                                          : "bg-red-100 text-red-800"
                                    }
                                  >
                                    {req.status}
                                  </Badge>
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Connect — Multi-step flow */}
              <div>
                <p className="text-xs font-semibold text-[var(--fg)] mb-3">Connect</p>
                <ConnectFlow
                  step={connectStep}
                  email={connectEmail}
                  emailError={connectEmailError}
                  lookupResult={connectLookupResult}
                  notOnPlatform={connectNotOnPlatform}
                  inviteSent={connectInviteSent}
                  selections={connectSelections}
                  visibility={connectVisibility}
                  sendResult={connectSendResult}
                  userEmail={store.profile.email ?? ""}
                  onEmailChange={setConnectEmail}
                  onEmailError={setConnectEmailError}
                  onLookupResult={setConnectLookupResult}
                  onNotOnPlatform={setConnectNotOnPlatform}
                  onInviteSent={setConnectInviteSent}
                  onSelections={setConnectSelections}
                  onVisibility={setConnectVisibility}
                  onSendResult={setConnectSendResult}
                  onStep={setConnectStep}
                  onSentRequests={setSentRequests}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {activeMember && (
          <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-3 flex items-center gap-3">
            <span className="text-xl" aria-hidden>{RELATION_EMOJI[activeMember.relation] ?? "🧑"}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--fg)]">Editing {activeMember.displayName}&apos;s profile</p>
              <p className="text-xs mv-muted">Changes here only affect this family member&apos;s profile.</p>
            </div>
            <Button
              variant="ghost"
              className="ml-auto h-8 text-xs gap-1.5 shrink-0"
              onClick={() => { setActiveFamilyMember(undefined); }}
            >
              Switch back to my profile
            </Button>
          </div>
        )}

        {/* ── OTP verification modal ── */}
        {showOtpModal && (
          <div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50"
            onClick={() => { setShowOtpModal(false); setOtpSent(false); setWaCodeInput(""); setWaCodeError(null); }}
          >
            <div
              className="mx-4 w-full max-w-sm rounded-3xl bg-[var(--panel)] border border-[var(--border)] p-6 shadow-2xl space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[var(--fg)]">Verify your number</h3>
                <button
                  type="button"
                  onClick={() => { setShowOtpModal(false); setOtpSent(false); setWaCodeInput(""); setWaCodeError(null); }}
                  className="text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm mv-muted">
                A 6-digit code will be sent to{" "}
                <span className="font-medium text-[var(--fg)]">{countryCodeInput} {phoneInput}</span>
              </p>

              {!otpSent ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2 text-xs text-[#25D366]">
                    Verification codes are sent through WhatsApp only.
                  </div>
                  {waCodeError && (
                    <p className="text-xs text-red-500 whitespace-pre-line">{waCodeError}</p>
                  )}
                  <button
                    type="button"
                    disabled={waSending}
                    className="w-full rounded-2xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick={async () => {
                      updateProfile({ phone: phoneInput, countryCode: countryCodeInput });
                      setPhoneSaved(true);
                      setWaSending(true);
                      setWaCodeError(null);
                      try {
                        const fullPhone = `${countryCodeInput}${phoneInput.replace(/^0+/, "")}`;
                        const res = await fetch("/api/whatsapp/link", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ phone: fullPhone }),
                        });
                        const data = await res.json() as { error?: string; hint?: string };
                        if (!res.ok) {
                          setWaCodeError(
                            [data.error, data.hint].filter(Boolean).join("\n\n") || "Failed to send code.",
                          );
                        } else {
                          setOtpSent(true);
                          setWaCodeInput("");
                        }
                      } catch {
                        setWaCodeError("Network error. Please try again.");
                      } finally {
                        setWaSending(false);
                      }
                    }}
                  >
                    {waSending ? "Sending…" : "Send code on WhatsApp"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs mv-muted">
                    Code sent on WhatsApp. Check your WhatsApp messages.
                  </p>
                  <Input
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={waCodeInput}
                    onChange={(e) => { setWaCodeInput(e.target.value.replace(/\D/g, "")); setWaCodeError(null); }}
                    className="text-center text-lg tracking-widest"
                  />
                  {waCodeError && (
                    <p className="text-xs text-red-500 whitespace-pre-line">{waCodeError}</p>
                  )}
                  <button
                    type="button"
                    disabled={waVerifying || waCodeInput.length !== 6}
                    className="w-full rounded-2xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 transition-opacity disabled:opacity-50"
                    onClick={async () => {
                      setWaVerifying(true);
                      setWaCodeError(null);
                      try {
                        const fullPhone = `${countryCodeInput}${phoneInput.replace(/^0+/, "")}`;
                        const res = await fetch("/api/whatsapp/link", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ phone: fullPhone, code: waCodeInput }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setWaCodeError(data.error || "Verification failed.");
                        } else {
                          updateProfile({
                            phone: phoneInput,
                            countryCode: countryCodeInput,
                            whatsappVerified: true,
                            whatsappPhone: phoneInput,
                          });
                          setPhoneDraftDirty(false);
                          setShowOtpModal(false);
                          setOtpSent(false);
                          setWaCodeInput("");
                          setWaCodeError(null);
                        }
                      } catch {
                        setWaCodeError("Network error. Please try again.");
                      } finally {
                        setWaVerifying(false);
                      }
                    }}
                  >
                    {waVerifying ? "Verifying…" : "Verify"}
                  </button>
                  <button
                    type="button"
                    disabled={waSending}
                    className="w-full text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
                    onClick={async () => {
                      setWaSending(true);
                      setWaCodeError(null);
                      try {
                        const fullPhone = `${countryCodeInput}${phoneInput.replace(/^0+/, "")}`;
                        const res = await fetch("/api/whatsapp/link", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ phone: fullPhone }),
                        });
                        const data = await res.json() as { error?: string; hint?: string };
                        if (!res.ok) {
                          setWaCodeError(
                            [data.error, data.hint].filter(Boolean).join("\n\n") || "Failed to resend.",
                          );
                        } else {
                          setWaCodeInput("");
                        }
                      } catch {
                        setWaCodeError("Network error.");
                      } finally {
                        setWaSending(false);
                      }
                    }}
                  >
                    {waSending ? "Sending…" : "Resend code"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
