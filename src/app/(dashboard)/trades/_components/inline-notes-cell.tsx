"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InlineNotesCellProps {
  notes: string | null;
  onSave: (notes: string) => Promise<void>;
}

export function InlineNotesCell({
  notes,
  onSave,
}: InlineNotesCellProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const t = useTranslations("trades");
  const tc = useTranslations("common");
  const hasNotes = notes !== null && notes.trim().length > 0;

  function handleOpen(isOpen: boolean): void {
    if (isOpen) {
      setValue(notes ?? "");
    }
    setOpen(isOpen);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      await onSave(value);
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
            "flex items-center justify-center rounded p-1 transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            hasNotes ? "text-foreground" : "text-muted-foreground/40",
          )}
          aria-label={t("notes")}
          title={hasNotes && notes ? (notes.length > 200 ? notes.slice(0, 200) + "…" : notes) : undefined}
        >
          <StickyNote className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("notesPlaceholder")}
            maxLength={1000}
            rows={3}
            className="text-sm"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{value.length}/1000</span>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? tc("saving") : tc("save")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
