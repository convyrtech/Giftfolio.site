"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const marketplaces = ["fragment", "getgems", "tonkeeper", "p2p", "other"] as const;
type Marketplace = (typeof marketplaces)[number];

const marketplaceLabels: Record<Marketplace, string> = {
  fragment: "Fragment",
  getgems: "Getgems",
  tonkeeper: "Tonkeeper",
  p2p: "P2P",
  other: "Other",
};

interface InlineMarketplaceCellProps {
  value: string | null;
  onSave: (marketplace: Marketplace | null) => Promise<void>;
}

export function InlineMarketplaceCell({
  value,
  onSave,
}: InlineMarketplaceCellProps): React.ReactElement {
  const [saving, setSaving] = useState(false);

  async function handleChange(newValue: string): Promise<void> {
    const marketplace: Marketplace | null =
      newValue === "none" ? null :
      (marketplaces as readonly string[]).includes(newValue) ? newValue as Marketplace : null;
    if (marketplace === value) return;
    setSaving(true);
    try {
      await onSave(marketplace);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      value={value ?? "none"}
      onValueChange={(v) => {
        void handleChange(v);
      }}
      disabled={saving}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-24 border-0 bg-transparent px-1 text-xs shadow-none",
          "hover:bg-muted focus:ring-1",
          saving && "opacity-50",
          !value && "text-muted-foreground",
        )}
        aria-label="Select marketplace"
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">—</SelectItem>
        {marketplaces.map((mp) => (
          <SelectItem key={mp} value={mp}>
            {marketplaceLabels[mp]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
