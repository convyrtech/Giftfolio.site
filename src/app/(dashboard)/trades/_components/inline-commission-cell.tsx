"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InlineCommissionCellProps {
  flatStars: bigint | null;
  permille: number | null;
  currency: "STARS" | "TON";
  onSave: (fields: { commissionFlatStars?: bigint; commissionPermille?: number }) => Promise<void>;
}

function formatCommission(flat: bigint | null, permille: number | null, currency: "STARS" | "TON"): string {
  const parts: string[] = [];
  if (flat !== null && flat > 0n && currency === "STARS") {
    parts.push(`${String(flat)}★`);
  }
  if (permille !== null && permille > 0) {
    parts.push(`${String(permille)}‰`);
  }
  return parts.length > 0 ? parts.join(" + ") : "—";
}

export function InlineCommissionCell({
  flatStars,
  permille,
  currency,
  onSave,
}: InlineCommissionCellProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [flatInput, setFlatInput] = useState("");
  const [permilleInput, setPermilleInput] = useState("");
  const [saving, setSaving] = useState(false);

  function handleOpen(isOpen: boolean): void {
    if (isOpen) {
      setFlatInput(flatStars !== null ? String(flatStars) : "");
      setPermilleInput(permille !== null ? String(permille) : "");
    }
    setOpen(isOpen);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const fields: { commissionFlatStars?: bigint; commissionPermille?: number } = {};
      const parsedFlat = flatInput.trim() === "" ? 0n : BigInt(flatInput.trim());
      const parsedPermille = permilleInput.trim() === "" ? 0 : Number(permilleInput.trim());

      if (isNaN(parsedPermille) || parsedPermille < 0 || parsedPermille > 1000) {
        toast.error("Permille must be between 0 and 1000");
        return;
      }
      if (parsedFlat < 0n) {
        toast.error("Flat commission cannot be negative");
        return;
      }

      fields.commissionFlatStars = parsedFlat;
      fields.commissionPermille = parsedPermille;

      await onSave(fields);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center rounded px-1 py-0.5 text-sm transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            saving && "opacity-50",
          )}
          disabled={saving}
          aria-label="Edit commission"
        >
          <span className="tabular-nums text-muted-foreground">
            {formatCommission(flatStars, permille, currency)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="start">
        <div className="space-y-3">
          {currency === "STARS" && (
            <div className="space-y-1">
              <Label htmlFor="comm-flat" className="text-xs">Flat (Stars)</Label>
              <Input
                id="comm-flat"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={flatInput}
                onChange={(e) => setFlatInput(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-8"
                autoFocus
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="comm-permille" className="text-xs">Rate (‰ permille)</Label>
            <Input
              id="comm-permille"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={permilleInput}
              onChange={(e) => setPermilleInput(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-8"
              autoFocus={currency === "TON"}
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
