"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatters";

interface InlineDateCellProps {
  value: Date | null;
  onSave: (date: Date) => Promise<void>;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
}

/** Strip local timezone offset so PostgreSQL date column stores the correct calendar date. */
function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function InlineDateCell({
  value,
  onSave,
  minDate,
  maxDate,
  placeholder = "—",
}: InlineDateCellProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSelect(date: Date | undefined) {
    if (!date) return;
    setOpen(false);
    setSaving(true);
    try {
      await onSave(toUTCDate(date));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={saving}
          className={cn(
            "group flex items-center gap-1 rounded px-1 py-0.5 text-sm transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            saving && "opacity-50 pointer-events-none",
          )}
          aria-label={
            value ? `Edit date: ${formatDate(value)}` : "Set date"
          }
        >
          {saving ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          ) : (
            <CalendarIcon className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          )}
          <span className={cn(!value && "text-muted-foreground")}>
            {value ? formatDate(value) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => void handleSelect(d)}
          fromDate={minDate}
          toDate={maxDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
