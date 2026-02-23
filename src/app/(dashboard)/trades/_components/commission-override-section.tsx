"use client";

import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CommissionOverrideSectionProps {
  expanded: boolean;
  onToggle: () => void;
  flat: string;
  onFlatChange: (value: string) => void;
  permille: string;
  onPermilleChange: (value: string) => void;
}

export function CommissionOverrideSection({
  expanded,
  onToggle,
  flat,
  onFlatChange,
  permille,
  onPermilleChange,
}: CommissionOverrideSectionProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="commission-override-content"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        Commission override
      </button>
      <div id="commission-override-content" className={cn("grid grid-cols-2 gap-3", !expanded && "hidden")}>
        <div className="space-y-1">
          <Label htmlFor="commFlat" className="text-xs">Flat (Stars)</Label>
          <Input
            id="commFlat"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={flat}
            onChange={(e) => onFlatChange(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="commPermille" className="text-xs">Permille (0-1000)</Label>
          <Input
            id="commPermille"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={permille}
            onChange={(e) => onPermilleChange(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
      </div>
    </div>
  );
}
