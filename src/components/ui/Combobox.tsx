"use client";

import * as React from "react";
import { ChevronsUpDown, Search, Trash2, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "./Popover";
import { cn } from "./cn";
import { normPickKey } from "@/lib/providerQuickPick";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onRemoveSuggestion?: (suggestion: string) => void;
  onRenameSuggestion?: (from: string, to: string) => void;
  onAppendCustom?: (value: string) => void;
}

const SEARCH_THRESHOLD = 5;

export function Combobox({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type or select…",
  className,
  disabled,
  onRemoveSuggestion,
  onAppendCustom,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [popoverSearch, setPopoverSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const showInlineSearch = suggestions.length >= SEARCH_THRESHOLD;

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
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setPopoverSearch("");
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

  React.useEffect(() => {
    if (showPopover && showInlineSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [showPopover, showInlineSearch]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setPopoverSearch("");
  }

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
        {showInlineSearch && (
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={popoverSearch}
              onChange={(e) => {
                setPopoverSearch(e.target.value);
                setQuery("");
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

        <div className="max-h-60 overflow-y-auto p-1">
          {hasSuggestions && (
            <>
              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-xs text-[var(--muted)]">No matches</p>
              ) : (
                filtered.map((s) => {
                  const selected = value === s;
                  return (
                    <div
                      key={s}
                      className={cn(
                        "group flex items-stretch rounded-xl",
                        selected ? "bg-[var(--accent)]/10" : "hover:bg-[var(--panel-2)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(s)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center px-3 py-2 text-left text-sm transition-colors",
                          selected ? "font-semibold text-[var(--accent)]" : "text-[var(--fg)]",
                        )}
                      >
                        <span className="truncate">{s}</span>
                      </button>
                      {onRemoveSuggestion && (
                        <button
                          type="button"
                          aria-label={`Remove ${s}`}
                          title="Remove"
                          className="flex shrink-0 items-center justify-center px-2.5 text-[var(--muted)] opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemoveSuggestion(s);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {canAppend && (
            <button
              type="button"
              onClick={() => {
                onAppendCustom?.(value.trim());
                setOpen(false);
              }}
              className={cn(
                "mt-1 w-full rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10",
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
