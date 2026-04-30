"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { cn } from "./cn";

/* ─── Tiny calendar (no external dep) ─────────────────────── */

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getStartDay(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0 = Sun
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/* ─── View modes ─────────────────────────────────────────── */
type CalendarView = "days" | "months" | "years";

/* ─── Calendar grid ───────────────────────────────────────── */
interface CalendarProps {
  selected?: string; // YYYY-MM-DD
  onSelect: (dateStr: string) => void;
  min?: string;
  max?: string;
}

function Calendar({ selected, onSelect, min, max }: CalendarProps) {
  const selDate = parseDate(selected ?? "");
  const now = new Date();
  const [viewYear, setViewYear] = React.useState(selDate?.getFullYear() ?? now.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(selDate?.getMonth() ?? now.getMonth());
  const [view, setView] = React.useState<CalendarView>("days");

  // Year range for the year picker (show decade around current view year)
  const yearStart = Math.floor(viewYear / 12) * 12;
  const yearRange = Array.from({ length: 12 }, (_, i) => yearStart + i);

  const days = getDaysInMonth(viewYear, viewMonth);
  const startDay = getStartDay(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  function isDisabled(day: number) {
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (min && ds < min) return true;
    if (max && ds > max) return true;
    return false;
  }

  function isSelected(day: number) {
    if (!selDate) return false;
    return selDate.getFullYear() === viewYear && selDate.getMonth() === viewMonth && selDate.getDate() === day;
  }

  function isToday(day: number) {
    return now.getFullYear() === viewYear && now.getMonth() === viewMonth && now.getDate() === day;
  }

  /* ─── Month picker view ─────────────────────────────────── */
  if (view === "months") {
    return (
      <div className="w-full select-none">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("years")}
            className="text-sm font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors px-2 py-0.5 rounded-lg hover:bg-[var(--panel-2)]"
          >
            {viewYear}
          </button>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_SHORT.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => { setViewMonth(i); setView("days"); }}
              className={cn(
                "py-2 rounded-lg text-xs font-medium transition-colors",
                "hover:bg-[var(--panel-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]",
                viewMonth === i && "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent)]",
                viewMonth !== i && now.getMonth() === i && now.getFullYear() === viewYear && "border border-[var(--accent)]/40 text-[var(--accent)]",
                viewMonth !== i && !(now.getMonth() === i && now.getFullYear() === viewYear) && "text-[var(--fg)]",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Year picker view ──────────────────────────────────── */
  if (view === "years") {
    return (
      <div className="w-full select-none">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 12)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-[var(--fg)]">
            {yearRange[0]} – {yearRange[yearRange.length - 1]}
          </span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 12)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {yearRange.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { setViewYear(y); setView("months"); }}
              className={cn(
                "py-2 rounded-lg text-xs font-medium transition-colors",
                "hover:bg-[var(--panel-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]",
                viewYear === y && "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent)]",
                viewYear !== y && y === now.getFullYear() && "border border-[var(--accent)]/40 text-[var(--accent)]",
                viewYear !== y && y !== now.getFullYear() && "text-[var(--fg)]",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Days view (default) ───────────────────────────────── */
  return (
    <div className="w-full select-none">
      {/* Month/Year nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView("months")}
            className="text-sm font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors px-1.5 py-0.5 rounded-lg hover:bg-[var(--panel-2)]"
          >
            {MONTHS[viewMonth]}
          </button>
          <button
            type="button"
            onClick={() => setView("years")}
            className="text-sm font-medium text-[var(--fg)] hover:text-[var(--accent)] transition-colors px-1.5 py-0.5 rounded-lg hover:bg-[var(--panel-2)]"
          >
            {viewYear}
          </button>
        </div>
        <button
          type="button"
          onClick={nextMonth}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-[var(--muted)] py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {/* Empty cells before first day */}
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* Day cells */}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const disabled = isDisabled(day);
          const sel = isSelected(day);
          const today = isToday(day);
          const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(ds)}
              className={cn(
                "h-8 w-full rounded-lg text-xs font-medium transition-colors",
                "hover:bg-[var(--panel-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]",
                disabled && "opacity-30 cursor-not-allowed hover:bg-transparent",
                sel && "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent)] hover:brightness-110",
                !sel && today && "border border-[var(--accent)]/40 text-[var(--accent)]",
                !sel && !today && "text-[var(--fg)]",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── DatePicker ──────────────────────────────────────────── */
interface DatePickerProps {
  value?: string;            // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const formatted = value ? formatDisplay(value) : null;

  function formatDisplay(ds: string) {
    const d = parseDate(ds);
    if (!d) return ds;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            formatted ? "text-[var(--fg)]" : "text-[var(--muted)]",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <span className="flex-1 text-left truncate">{formatted ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <Calendar
          selected={value}
          min={min}
          max={max}
          onSelect={(ds) => {
            onChange(ds);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
