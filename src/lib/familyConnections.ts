/**
 * Client-side family connection request system.
 * Works when both users are on the same device (family member scenario).
 * Requests and links are stored in localStorage under a "shared request inbox" key.
 */

import { FamilyConnectionRequest, FamilyLink, FamilyLinkVisibility, FamilyRelation } from "@/lib/types";

/**
 * Generates a stable key for storing requests to a specific email.
 * Format: mv_family_req_inbox_{email}_v1
 */
function inboxKey(email: string): string {
  if (typeof window === "undefined") return "";
  // Use email directly in the key (localStorage can handle it)
  return `mv_family_req_inbox_${email}_v1`;
}

/**
 * Returns the inverse relationship from the recipient's perspective.
 */
export function getInverseRelation(relation: FamilyRelation): FamilyRelation {
  const inverseMap: Record<FamilyRelation, FamilyRelation> = {
    self: "self",
    mother: "child",
    father: "child",
    son: "father",
    daughter: "mother",
    spouse: "spouse",
    husband: "wife",
    wife: "husband",
    brother: "brother", // sibling → sibling (no "sibling" type, use brother/sister)
    sister: "sister",
    grandfather: "child", // grandchild → child (no "grandchild" type)
    grandmother: "child",
    child: "mother", // child → parent is ambiguous; defaults to mother
    other: "other",
  };
  return inverseMap[relation] || "other";
}

/**
 * Send a connection request from one account to another.
 * Stores it in the sender's store and the recipient's shared inbox.
 */
export function sendFamilyConnectionRequest(params: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  senderRelation: FamilyRelation;
  recipientRelation: FamilyRelation;
  senderVisibility: FamilyLinkVisibility;
  toInternalId?: string;
  fromInternalId?: string;
}): FamilyConnectionRequest {
  if (typeof window === "undefined") {
    throw new Error("sendFamilyConnectionRequest must be called in the browser");
  }

  const request: FamilyConnectionRequest = {
    id: `fam_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAtISO: new Date().toISOString(),
    fromAccountEmail: params.fromEmail,
    fromAccountName: params.fromName,
    toAccountEmail: params.toEmail,
    senderRelation: params.senderRelation,
    recipientRelation: params.recipientRelation,
    status: "pending",
    senderVisibility: params.senderVisibility,
    toInternalId: params.toInternalId,
    fromInternalId: params.fromInternalId,
  };

  // Store in the recipient's inbox
  const inboxKeyStr = inboxKey(params.toEmail);
  const existingInbox = getIncomingRequests(params.toEmail);
  const updated = [request, ...existingInbox];
  localStorage.setItem(inboxKeyStr, JSON.stringify(updated));

  // Also store in sender's store for their own reference
  // (they can see pending requests they sent)
  try {
    const storeRaw = localStorage.getItem("mv_patient_store_v1");
    if (storeRaw) {
      const store = JSON.parse(storeRaw);
      if (!store.pendingFamilyRequests) store.pendingFamilyRequests = [];
      store.pendingFamilyRequests = [request, ...store.pendingFamilyRequests].slice(0, 100);
      store.updatedAtISO = new Date().toISOString();
      localStorage.setItem("mv_patient_store_v1", JSON.stringify(store));
      // Dispatch event so UI can refresh
      window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
    }
  } catch {
    // If store is not available, that's OK — just the inbox entry is what matters
  }

  return request;
}

/**
 * Retrieve all pending/accepted incoming requests for the given email.
 */
export function getIncomingRequests(myEmail: string): FamilyConnectionRequest[] {
  if (typeof window === "undefined") return [];

  const inboxKeyStr = inboxKey(myEmail);
  try {
    const raw = localStorage.getItem(inboxKeyStr);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FamilyConnectionRequest[]) : [];
  } catch {
    return [];
  }
}

/**
 * Accept a family connection request.
 * Creates FamilyLink entries on both sides.
 */
export function acceptFamilyRequest(
  request: FamilyConnectionRequest,
  myName: string,
  recipientVisibility: FamilyLinkVisibility
): void {
  if (typeof window === "undefined") {
    throw new Error("acceptFamilyRequest must be called in the browser");
  }

  const accepted: FamilyConnectionRequest = {
    ...request,
    status: "accepted",
    respondedAtISO: new Date().toISOString(),
    recipientVisibility,
  };

  // Update inbox with accepted status
  const inboxKeyStr = inboxKey(request.toAccountEmail);
  const inbox = getIncomingRequests(request.toAccountEmail);
  const updated = inbox.map((r) => (r.id === request.id ? accepted : r));
  localStorage.setItem(inboxKeyStr, JSON.stringify(updated));

  // Create link on recipient's side (this account)
  const recipientLink: FamilyLink = {
    id: request.id,
    linkedAccountEmail: request.fromAccountEmail,
    linkedAccountName: request.fromAccountName,
    relation: request.recipientRelation,
    myVisibility: recipientVisibility,
    linkedAtISO: new Date().toISOString(),
    linkedInternalId: request.fromInternalId,
    linkedDisplayName: request.fromAccountName,
  };

  // Create link on sender's side
  const senderLink: FamilyLink = {
    id: request.id,
    linkedAccountEmail: request.toAccountEmail,
    linkedAccountName: myName,
    relation: request.senderRelation,
    myVisibility: request.senderVisibility,
    linkedAtISO: new Date().toISOString(),
    linkedInternalId: request.toInternalId,
    linkedDisplayName: myName,
  };

  // Save recipient link to this account's store
  try {
    const storeRaw = localStorage.getItem("mv_patient_store_v1");
    if (storeRaw) {
      const store = JSON.parse(storeRaw);
      if (!store.familyLinks) store.familyLinks = [];
      store.familyLinks = [
        recipientLink,
        ...store.familyLinks.filter((l: FamilyLink) => l.id !== request.id),
      ];
      if (!store.pendingFamilyRequests) store.pendingFamilyRequests = [];
      store.pendingFamilyRequests = store.pendingFamilyRequests.filter((r: FamilyConnectionRequest) => r.id !== request.id);
      store.updatedAtISO = new Date().toISOString();
      localStorage.setItem("mv_patient_store_v1", JSON.stringify(store));
      window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
    }
  } catch {
    // Store may not exist yet
  }

  // Save sender link to sender's store (if it exists on this device)
  try {
    const senderStoreRaw = localStorage.getItem("mv_patient_store_v1");
    if (senderStoreRaw) {
      const senderStore = JSON.parse(senderStoreRaw);
      // Only update if this is the sender's account (email matches)
      if (senderStore.profile?.email === request.fromAccountEmail) {
        if (!senderStore.familyLinks) senderStore.familyLinks = [];
        senderStore.familyLinks = [
          senderLink,
          ...senderStore.familyLinks.filter((l: FamilyLink) => l.id !== request.id),
        ];
        if (!senderStore.pendingFamilyRequests) senderStore.pendingFamilyRequests = [];
        senderStore.pendingFamilyRequests = senderStore.pendingFamilyRequests.filter(
          (r: FamilyConnectionRequest) => r.id !== request.id
        );
        senderStore.updatedAtISO = new Date().toISOString();
        localStorage.setItem("mv_patient_store_v1", JSON.stringify(senderStore));
        window.dispatchEvent(new CustomEvent("mv-store-update", { detail: senderStore }));
      }
    }
  } catch {
    // Sender store may not be on this device
  }

  // Dispatch event for UI
  window.dispatchEvent(new CustomEvent("uma-family-request-accepted", { detail: accepted }));
}

/**
 * Reject a family connection request.
 */
export function rejectFamilyRequest(request: FamilyConnectionRequest): void {
  if (typeof window === "undefined") {
    throw new Error("rejectFamilyRequest must be called in the browser");
  }

  const rejected: FamilyConnectionRequest = {
    ...request,
    status: "rejected",
    respondedAtISO: new Date().toISOString(),
  };

  // Update inbox with rejected status
  const inboxKeyStr = inboxKey(request.toAccountEmail);
  const inbox = getIncomingRequests(request.toAccountEmail);
  const updated = inbox.map((r) => (r.id === request.id ? rejected : r));
  localStorage.setItem(inboxKeyStr, JSON.stringify(updated));

  // Remove from pending family requests in store
  try {
    const storeRaw = localStorage.getItem("mv_patient_store_v1");
    if (storeRaw) {
      const store = JSON.parse(storeRaw);
      if (store.pendingFamilyRequests) {
        store.pendingFamilyRequests = store.pendingFamilyRequests.filter(
          (r: FamilyConnectionRequest) => r.id !== request.id
        );
      }
      store.updatedAtISO = new Date().toISOString();
      localStorage.setItem("mv_patient_store_v1", JSON.stringify(store));
      window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
    }
  } catch {
    // Store may not exist
  }

  window.dispatchEvent(new CustomEvent("uma-family-request-rejected", { detail: rejected }));
}

/**
 * Get all confirmed family links for this account.
 */
export function getFamilyLinks(): FamilyLink[] {
  if (typeof window === "undefined") return [];

  try {
    const storeRaw = localStorage.getItem("mv_patient_store_v1");
    if (!storeRaw) return [];
    const store = JSON.parse(storeRaw);
    return Array.isArray(store.familyLinks) ? (store.familyLinks as FamilyLink[]) : [];
  } catch {
    return [];
  }
}

/**
 * Remove a family link (disconnect).
 */
export function removeFamilyLink(linkId: string): void {
  if (typeof window === "undefined") {
    throw new Error("removeFamilyLink must be called in the browser");
  }

  try {
    const storeRaw = localStorage.getItem("mv_patient_store_v1");
    if (storeRaw) {
      const store = JSON.parse(storeRaw);
      if (store.familyLinks) {
        store.familyLinks = store.familyLinks.filter((l: FamilyLink) => l.id !== linkId);
      }
      store.updatedAtISO = new Date().toISOString();
      localStorage.setItem("mv_patient_store_v1", JSON.stringify(store));
      window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
    }
  } catch {
    // Store may not exist
  }

  window.dispatchEvent(new CustomEvent("uma-family-link-removed", { detail: { linkId } }));
}

/**
 * Get all pending and accepted connection requests sent from this account.
 */
export function getSentFamilyRequests(): FamilyConnectionRequest[] {
  if (typeof window === "undefined") return [];

  try {
    const storeRaw = localStorage.getItem("mv_patient_store_v1");
    if (!storeRaw) return [];
    const store = JSON.parse(storeRaw);
    return Array.isArray(store.pendingFamilyRequests) ? (store.pendingFamilyRequests as FamilyConnectionRequest[]) : [];
  } catch {
    return [];
  }
}

