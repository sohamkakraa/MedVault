"use client";

/**
 * Global upload context — lives at the layout level so the extraction fetch
 * continues even when the user navigates away from the dashboard.
 *
 * Flow:
 *   1. Dashboard calls startExtract() → fetch runs inside this context
 *   2. User can navigate freely; the fetch is never cancelled
 *   3. When done, status flips to "done" and the dashboard (or any page) can
 *      call commitAndClear() to save the result to the store
 *   4. A floating badge (GlobalUploadBadge) shows progress on every page
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ExtractedDoc, StandardLexiconEntry } from "@/lib/types";

/* ─── Types ──────────────────────────────────────────────── */
export type UploadPhase = "idle" | "extracting" | "ready" | "error";

export interface ExtractionResult {
  doc: ExtractedDoc;
  lexiconPatches: StandardLexiconEntry[];
  nameMismatch?: {
    namesOnDocument: string[];
    profileDisplayName: string;
  } | null;
}

export interface GlobalUploadState {
  phase: UploadPhase;
  fileName: string;
  error: string | null;
  result: ExtractionResult | null;
}

interface GlobalUploadContextValue extends GlobalUploadState {
  /** Kick off extraction in the background. Returns immediately. */
  startExtract: (params: {
    file: File;
    typeHint: string;
    patientName: string;
    existingContentHashes: string[];
    standardLexicon: StandardLexiconEntry[];
  }) => void;
  /** Cancel an in-progress extraction. */
  cancelExtract: () => void;
  /** Reset to idle (called after committing or dismissing). */
  clear: () => void;
}

const defaultState: GlobalUploadState = {
  phase: "idle",
  fileName: "",
  error: null,
  result: null,
};

const GlobalUploadContext = createContext<GlobalUploadContextValue>({
  ...defaultState,
  startExtract: () => {},
  cancelExtract: () => {},
  clear: () => {},
});

export function useGlobalUpload() {
  return useContext(GlobalUploadContext);
}

/* ─── Provider ───────────────────────────────────────────── */
export function GlobalUploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalUploadState>(defaultState);
  const abortRef = useRef<AbortController | null>(null);

  const startExtract = useCallback(
    ({
      file,
      typeHint,
      patientName,
      existingContentHashes,
      standardLexicon,
    }: {
      file: File;
      typeHint: string;
      patientName: string;
      existingContentHashes: string[];
      standardLexicon: StandardLexiconEntry[];
    }) => {
      // Cancel any previous in-flight extraction
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ phase: "extracting", fileName: file.name, error: null, result: null });

      const fd = new FormData();
      fd.append("file", file);
      fd.append("typeHint", typeHint);
      fd.append("patientName", patientName);
      fd.append("existingContentHashes", JSON.stringify(existingContentHashes));
      fd.append("standardLexicon", JSON.stringify(standardLexicon));

      fetch("/api/extract", { method: "POST", body: fd, signal: controller.signal })
        .then(async (r) => {
          const j = await r.json();
          if (r.ok) {
            setState({
              phase: "ready",
              fileName: file.name,
              error: null,
              result: {
                doc: j.doc as ExtractedDoc,
                lexiconPatches: (j.lexiconPatches as StandardLexiconEntry[]) ?? [],
                nameMismatch: null,
              },
            });
            return;
          }
          if (j.code === "patient_name_mismatch" && j.doc) {
            setState({
              phase: "ready",
              fileName: file.name,
              error: null,
              result: {
                doc: j.doc as ExtractedDoc,
                lexiconPatches: (j.lexiconPatches as StandardLexiconEntry[]) ?? [],
                nameMismatch: {
                  namesOnDocument: Array.isArray(j.namesOnDocument) ? j.namesOnDocument : [],
                  profileDisplayName: String(j.profileDisplayName ?? ""),
                },
              },
            });
            return;
          }
          setState((s) => ({
            ...s,
            phase: "error",
            error: j?.error ?? "Could not read this file",
          }));
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          setState((s) => ({
            ...s,
            phase: "error",
            error: (err as Error).message ?? "Could not read this file",
          }));
        });
    },
    []
  );

  const cancelExtract = useCallback(() => {
    abortRef.current?.abort();
    setState(defaultState);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState(defaultState);
  }, []);

  return (
    <GlobalUploadContext.Provider value={{ ...state, startExtract, cancelExtract, clear }}>
      {children}
    </GlobalUploadContext.Provider>
  );
}
