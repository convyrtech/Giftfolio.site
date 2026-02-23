"use client";

import * as React from "react";
import { Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

// Chart config type for consistent color/label management
export interface ChartConfig {
  [key: string]: {
    label: string;
    color?: string;
    icon?: React.ComponentType;
  };
}

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
}

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: ChartContainerProps): React.ReactElement {
  const cssVars = Object.entries(config).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (value.color) {
        acc[`--color-${key}`] = value.color;
      }
      return acc;
    },
    {},
  );

  return (
    <div
      className={cn("flex aspect-video justify-center text-xs", className)}
      style={cssVars as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

// Custom tooltip that uses chart config for labels
interface ChartTooltipContentProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number | string;
    color?: string;
    dataKey?: string;
  }>;
  label?: string;
  config?: ChartConfig;
  formatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string) => string;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  config,
  formatter,
  labelFormatter,
}: ChartTooltipContentProps): React.ReactElement | null {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-sm">
      {label && (
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      {payload.map((entry, i) => {
        const configEntry = config?.[entry.dataKey ?? entry.name];
        const displayLabel = configEntry?.label ?? entry.name;
        const displayValue = formatter
          ? formatter(entry.value, entry.name)
          : String(entry.value);

        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color ?? `var(--color-${entry.dataKey ?? entry.name})` }}
            />
            <span className="text-muted-foreground">{displayLabel}:</span>
            <span className="font-medium">{displayValue}</span>
          </div>
        );
      })}
    </div>
  );
}

export { RechartsTooltip as ChartTooltip };
