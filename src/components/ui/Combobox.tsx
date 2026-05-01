"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Pencil, Search, Trash2, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "./Popover";
import { cn } from "./cn";
import { normPickKey } from "@/lib/providerQuickPick";

/* ─── Combobox ────────────────────────────────────────────── */
interface ComboboxProps {
  /** Current value (free text or selected suggestion). */
  value: string;
  onChange: (value: string) => void;
  /** Suggestion list. The user can still type a custom value not in this list. */
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Remove this name from the list (hide file-derived names or delete saved quick-pick entries). */
  onRemoveSuggestion?: (suggestion: string) => void;
  /** Rename a list entry; parent updates stored quick-pick / field value. */
  onRenameSuggestion?: (from: string, to: string) => void;
  /** Save the current input as a personal quick-pick entry (shown even if not on a file). */
  onAppendCustom?: (value: string) => void;
}

const SEARCH_THRESHOLD = 5; // show search box inside popover when list is this long

export function Combobox({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type or select…",
  className,
  disabled,
  onRemoveSuggestion,
  onRenameSuggestion,
  onAppendCustom,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Separate search state for inside the popover (doesn't mutate the field value)
  const [popoverSearch, setPopoverSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [editingSuggestion, setEditingSuggestion] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");

  const showInlineSearch = suggestions.length >= SEARCH_THRESHOLD;

  // When the main input has text, use that to filter; otherwise use popoverSearch
  const activeFilter = query || popoverSearch;
  const filtered = React.useMemo(() => {
    if (!activeFilter) return suggestions;
    const q = activeFilter.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, activeFilter]);

  const valueNormInSuggestions = React.useMemo(
    () => suggestions.some((s) => normPickKey(s) === normPickKey(value)),
    [suggestions, value],
  );

  const canAppend =
    Boolean(onAppendCustom && value.trim() && !valueNormInSuggestions);

  function handleSelect(s: string) {
    onChange(s);
    setQuery("");
    setPopoverSearch("");
    setOpen(false);
    setEditingSuggestion(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setPopoverSearch(""); // main input takes priority
    onChange(v);
    const appendNow = Boolean(
      onAppendCustom &&
        v.trim() &&
        !suggestions.some((s) => normPickKey(s) === normPickKey(v)),
    );
    const hasList = suggestions.length > 0 || appendNow;
    if (!open && hasList) setOpen(true);
  }

  const hasSuggestions = suggestions.length > 0;
  const allowPopover = hasSuggestions || canAppend;
  const showPopover = open && allowPopover;

  React.useEffect(() => {
    if (!allowPopover && open) setOpen(false);
  }, [allowPopover, open]);

  // When the popover opens, focus the search input (if visible)
  React.useEffect(() => {
    if (showPopover && showInlineSearch && !editingSuggestion) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [showPopover, showInlineSearch, editingSuggestion]);

  function commitRename() {
    if (!editingSuggestion || !onRenameSuggestion) return;
    const t = renameDraft.trim();
    if (t && t !== editingSuggestion) onRenameSuggestion(editingSuggestion, t);
    setEditingSuggestion(null);
    setRenameDraft("");
  }

  function cancelRename() {
    setEditingSuggestion(null);
    setRenameDraft("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setEditingSuggestion(null);
      setRenameDraft("");
      setPopoverSearch("");
    }
  }

  const canEdit = Boolean(onRenameSuggestion || onRemoveSuggestion);

  return (
    <Popover modal={false} open={showPopover} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex h-10 w-full min-w-0 items-stretch rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] transition-colors",
            "focus-within:ring-2 focus-within:ring-[var(--ring)]",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onFocus={() => {
              if (hasSuggestions || canAppend) setOpen(true);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
            style={{ color: "var(--fg)" }}
            autoComplete="off"
          />
          {(hasSuggestions || canAppend) && (
            <button
              type="button"
              tabIndex={-1}
              aria-expanded={showPopover}
              aria-haspopup="listbox"
              aria-label="Show suggestions"
              onMouseDown={(e) => {
                e.preventDefault();
                inputRef.current?.focus();
              }}
              onClick={() => {
                handleOpenChange(!open);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="shrink-0 px-2 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
              disabled={disabled}
            >
              <ChevronsUpDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[max(14rem,var(--radix-popover-trigger-width,14rem))] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── Inline search ── */}
        {showInlineSearch && !editingSuggestion && (
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={popoverSearch}
              onChange={(e) => {
                setPopoverSearch(e.target.value);
                setQuery(""); // let popoverSearch drive filtering
              }}
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
              style={{ color: "var(--fg)" }}
            />
            {popoverSearch && (
              <button
                type="button"
                onClick={() => setPopoverSearch("")}
                className="text-[var(--muted)] hover:text-[var(--fg)]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="max-h-60 overflow-y-auto p-1.5">
          {/* ── Suggestion list ── */}
          {hasSuggestions && (
            <>
              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-xs text-[var(--muted)]">No matches</p>
              ) : (
                filtered.map((s) =>
                  editingSuggestion === s ? (
                    /* ── Edit panel (merged rename + remove) ── */
                    <div
                      key={s}
                      className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3"
                    >
                      <p className="text-xs font-medium text-[var(--muted)]">Edit entry</p>
                      {onRenameSuggestion && (
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                            if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                          }}
                        />
                      )}
                      <div className="flex items-center gap-1.5">
                        {/* Remove button — destructive, full-width if no rename */}
                        {onRemoveSuggestion && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onRemoveSuggestion(s);
                              cancelRename();
                            }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--panel)] transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Cancel
                        </button>
                        {onRenameSuggestion && (
                          <button
                            type="button"
                            onClick={commitRename}
                            className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent-contrast)] transition-colors"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div
                      key={s}
                      className="flex items-stretch gap-0.5 rounded-xl hover:bg-[var(--panel-2)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(s)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-l-xl px-2 py-2 text-left text-sm text-[var(--fg)] transition-colors",
                          value === s && "font-medium",
                        )}
                      >
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            value === s ? "text-[var(--accent)] opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{s}</span>
                      </button>
                      {/* Single edit button — opens the merged edit/remove panel */}
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Edit or remove ${s}`}
                          title="Edit or remove"
                          className="flex shrink-0 items-center rounded-r-xl border-l border-[var(--border)] px-2.5 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--fg)] transition-colors"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingSuggestion(s);
                            setRenameDraft(s);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ),
                )
              )}
            </>
          )}

          {/* ── Save custom entry ── */}
          {canAppend && (
            <button
              type="button"
              onClick={() => {
                onAppendCustom?.(value.trim());
                setOpen(false);
              }}
              className={cn(
                "mt-1 w-full rounded-xl border border-dashed border-[var(--border)] px-2 py-2 text-left text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10",
                hasSuggestions && "border-t border-solid pt-2",
              )}
            >
              Save &ldquo;{value.trim()}&rdquo; to my list
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
