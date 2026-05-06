"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Calendar } from "./Calendar";
import { cn } from "./cn";

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDisplay(ds: string) {
  const d = parseDate(ds);
  if (!d) return ds;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

interface DatePickerProps {
  value?: string;
  onChange: (dateStr: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  /** Caption layout — "dropdown" gives month + year selectors (good for DOB). "label" is a static title. */
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
  /** Earliest year shown in the year dropdown when captionLayout includes "dropdown-years". */
  fromYear?: number;
  /** Latest year shown in the year dropdown. */
  toYear?: number;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  className,
  disabled,
  captionLayout = "dropdown",
  fromYear,
  toYear,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDate(value ?? "");
  const formatted = value ? formatDisplay(value) : null;
  const minDate = parseDate(min ?? "");
  const maxDate = parseDate(max ?? "");

  const startMonth = fromYear ? new Date(fromYear, 0, 1) : minDate;
  const endMonth = toYear ? new Date(toYear, 11, 31) : maxDate;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 text-sm transition-colors",
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
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          captionLayout={captionLayout}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          onSelect={(d) => {
            if (!d) return;
            onChange(toDateStr(d));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
