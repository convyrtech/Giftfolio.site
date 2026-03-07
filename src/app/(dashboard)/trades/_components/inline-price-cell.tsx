"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  parseTonInput,
  parseStarsInput,
  formatTon,
  formatStars,
  nanoTonToTonString,
  type NanoTon,
  type Stars,
} from "@/lib/currencies";

interface InlinePriceCellProps {
  value: bigint | null;
  currency: "STARS" | "TON";
  onSave: (price: bigint) => Promise<void>;
  align?: "left" | "right";
  placeholder?: string;
}

function toEditString(value: bigint, currency: "STARS" | "TON"): string {
  if (currency === "TON") return nanoTonToTonString(value as NanoTon);
  return String(value);
}

function parseEditString(raw: string, currency: "STARS" | "TON"): bigint {
  if (currency === "TON") return parseTonInput(raw);
  return parseStarsInput(raw);
}

function formatDisplay(value: bigint, currency: "STARS" | "TON"): string {
  if (currency === "TON") return formatTon(value as NanoTon);
  return formatStars(value as Stars);
}

export function InlinePriceCell({
  value,
  currency,
  onSave,
  align = "right",
  placeholder = "—",
}: InlinePriceCellProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [hasError, setHasError] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track whether commit is already running to prevent double-fire on blur-after-enter
  const committingRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    setInputVal(value !== null ? toEditString(value, currency) : "");
    setHasError(false);
    setEditing(true);
  }

  async function commit() {
    if (!editing || committingRef.current) return;
    committingRef.current = true;

    // If input is empty and value was null, just cancel (no change)
    if (inputVal.trim() === "" && value === null) {
      setEditing(false);
      committingRef.current = false;
      return;
    }

    let parsed: bigint;
    try {
      parsed = parseEditString(inputVal, currency);
    } catch {
      setHasError(true);
      committingRef.current = false;
      // Re-focus so user can fix the value
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setEditing(false);
    setSaving(true);
    try {
      await onSave(parsed);
    } finally {
      setSaving(false);
      committingRef.current = false;
    }
  }

  function cancel() {
    setEditing(false);
    setHasError(false);
    committingRef.current = false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <div className={cn("flex", align === "right" ? "justify-end" : "justify-start")}>
        <Input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            setHasError(false);
          }}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          className={cn(
            "h-7 w-28 px-1.5 text-sm tabular-nums",
            align === "right" && "text-right",
            hasError && "border-destructive focus-visible:ring-destructive",
          )}
          aria-invalid={hasError ? "true" : "false"}
          aria-label={`Edit ${currency} price`}
        />
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      disabled={saving}
      className={cn(
        "group flex w-full items-center gap-1 rounded px-1 py-0.5 text-sm transition-colors",
        value !== null && "tabular-nums",
        align === "right" && "justify-end",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        saving && "opacity-50",
        value === null && "text-muted-foreground",
      )}
      aria-label={value !== null ? `Edit price: ${formatDisplay(value, currency)}` : "Set price"}
    >
      {saving && (
        <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {value !== null ? formatDisplay(value, currency) : placeholder}
    </button>
  );
}
