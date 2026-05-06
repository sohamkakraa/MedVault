"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "./cn";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium text-[var(--fg)]",
        nav: "flex items-center gap-1",
        button_previous: cn(
          "absolute left-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent p-0 text-[var(--fg)] opacity-70 hover:opacity-100 hover:bg-[var(--panel-2)]",
        ),
        button_next: cn(
          "absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-transparent p-0 text-[var(--fg)] opacity-70 hover:opacity-100 hover:bg-[var(--panel-2)]",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-[var(--muted)] rounded-md w-9 font-normal text-[0.75rem] text-center",
        week: "flex w-full mt-1",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-[var(--accent)]/10 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        day_button: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md p-0 font-normal text-[var(--fg)] transition-colors",
          "hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "aria-selected:bg-[var(--accent)] aria-selected:text-[var(--accent-contrast)] aria-selected:hover:bg-[var(--accent)] aria-selected:font-semibold",
        ),
        selected: "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent)] focus:bg-[var(--accent)]",
        today: "[&>button]:bg-[var(--panel-2)] [&>button]:font-semibold",
        outside:
          "day-outside text-[var(--muted)] opacity-50 aria-selected:bg-[var(--accent)]/40",
        disabled: "text-[var(--muted)] opacity-40",
        hidden: "invisible",
        dropdowns: "flex items-center gap-1.5",
        dropdown:
          "appearance-none bg-[var(--panel-2)] border border-[var(--border)] rounded-md px-2 py-1 text-sm text-[var(--fg)] outline-none focus:ring-2 focus:ring-[var(--ring)]",
        dropdown_root: "relative inline-flex items-center",
        chevron: "fill-[var(--muted)]",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chClass }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("h-4 w-4", chClass)} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
