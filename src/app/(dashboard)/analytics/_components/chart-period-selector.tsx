"use client";

import { cn } from "@/lib/utils";

const RANGES = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
] as const;

export type Range = (typeof RANGES)[number]["value"];

interface ChartPeriodSelectorProps {
  value: Range;
  onChange: (range: Range) => void;
}

export function ChartPeriodSelector({ value, onChange }: ChartPeriodSelectorProps): React.ReactElement {
  return (
    <div className="flex gap-1 rounded-md border p-0.5" role="group" aria-label="Chart period">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          aria-pressed={value === r.value}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === r.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
