"use client";

import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { trpc } from "@/lib/trpc/client";
import { parseGiftUrl, getGiftImageUrl } from "@/lib/gift-parser";
import type { Trade } from "@/server/db/schema";

type Marketplace = "fragment" | "getgems" | "tonkeeper" | "p2p" | "other";

const MARKETPLACES: readonly { value: Marketplace; label: string }[] = [
  { value: "fragment", label: "Fragment" },
  { value: "getgems", label: "Getgems" },
  { value: "tonkeeper", label: "Tonkeeper" },
  { value: "p2p", label: "P2P" },
  { value: "other", label: "Other" },
];

interface TradeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade?: Trade;
}

export function TradeFormDialog({
  open,
  onOpenChange,
  trade,
}: TradeFormDialogProps): React.ReactElement {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isEdit = !!trade;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit trade" : "Add trade"}</DialogTitle>
          </DialogHeader>
          <TradeForm trade={trade} onSuccess={() => onOpenChange(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit trade" : "Add trade"}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <TradeForm trade={trade} onSuccess={() => onOpenChange(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface TradeFormProps {
  trade?: Trade;
  onSuccess: () => void;
}

function TradeForm({ trade, onSuccess }: TradeFormProps): React.ReactElement {
  const utils = trpc.useUtils();
  const isEdit = !!trade;

  // Form state
  const [giftUrl, setGiftUrl] = useState(trade?.giftLink ?? "");
  const [currency, setCurrency] = useState<"STARS" | "TON">(trade?.tradeCurrency ?? "STARS");
  const [buyPrice, setBuyPrice] = useState(trade ? String(trade.buyPrice) : "");
  const [sellPrice, setSellPrice] = useState(
    trade?.sellPrice !== null && trade?.sellPrice !== undefined ? String(trade.sellPrice) : "",
  );
  const [buyDate, setBuyDate] = useState<Date>(trade?.buyDate ?? new Date());
  const [sellDate, setSellDate] = useState<Date | undefined>(trade?.sellDate ?? undefined);
  const [buyMarketplace, setBuyMarketplace] = useState<Marketplace | "">(trade?.buyMarketplace ?? "");
  const [sellMarketplace, setSellMarketplace] = useState<Marketplace | "">(trade?.sellMarketplace ?? "");
  const [notes, setNotes] = useState(trade?.notes ?? "");

  // Gift preview from URL parsing
  const [giftPreview, setGiftPreview] = useState(() => {
    const initialUrl = trade?.giftLink ?? "";
    if (!initialUrl) return null;
    const parsed = parseGiftUrl(initialUrl);
    if (!parsed) return null;
    return {
      name: parsed.name,
      number: parsed.number,
      displayName: parsed.displayName,
      imageUrl: getGiftImageUrl(parsed.nameLower, parsed.number),
    };
  });

  function handleGiftUrlChange(url: string): void {
    setGiftUrl(url);
    const parsed = parseGiftUrl(url);
    if (parsed) {
      setGiftPreview({
        name: parsed.name,
        number: parsed.number,
        displayName: parsed.displayName,
        imageUrl: getGiftImageUrl(parsed.nameLower, parsed.number),
      });
    } else {
      setGiftPreview(null);
    }
  }

  const addTrade = trpc.trades.add.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success("Trade added");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateTrade = trpc.trades.update.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success("Trade updated");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();

    try {
      if (isEdit && trade) {
        updateTrade.mutate({
          id: trade.id,
          sellPrice: sellPrice ? BigInt(sellPrice) : undefined,
          sellDate: sellDate ?? undefined,
          sellMarketplace: sellMarketplace || undefined,
          notes: notes || undefined,
        });
      } else {
        if (!giftUrl || !buyPrice) {
          toast.error("Fill required fields");
          return;
        }
        addTrade.mutate({
          giftUrl,
          tradeCurrency: currency,
          buyPrice: BigInt(buyPrice),
          buyDate,
          sellPrice: sellPrice ? BigInt(sellPrice) : undefined,
          sellDate: sellDate ?? undefined,
          buyMarketplace: buyMarketplace || undefined,
          sellMarketplace: sellMarketplace || undefined,
          notes: notes || undefined,
        });
      }
    } catch {
      toast.error("Invalid price value");
    }
  };

  const isPending = addTrade.isPending || updateTrade.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Gift URL */}
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="giftUrl">Gift URL</Label>
          <Input
            id="giftUrl"
            placeholder="https://t.me/nft/EasterEgg-52095"
            value={giftUrl}
            onChange={(e) => handleGiftUrlChange(e.target.value)}
            autoFocus
          />
          {giftPreview && (
            <div className="flex items-center gap-2 rounded-md border p-2">
              <Image
                src={giftPreview.imageUrl}
                alt={giftPreview.displayName}
                width={36}
                height={36}
                className="rounded"
              />
              <div>
                <div className="text-sm font-medium">{giftPreview.displayName}</div>
                <div className="text-xs text-muted-foreground">#{giftPreview.number}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Currency */}
      {!isEdit && (
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as "STARS" | "TON")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STARS">Stars</SelectItem>
              <SelectItem value="TON">TON</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Buy section */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="buyPrice">Buy Price{!isEdit && " *"}</Label>
          <Input
            id="buyPrice"
            type="text"
            inputMode="numeric"
            placeholder={currency === "STARS" ? "1000" : "3500000000"}
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value.replace(/[^0-9]/g, ""))}
            disabled={isEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Buy Date{!isEdit && " *"}</Label>
          <DatePicker date={buyDate} onSelect={(d) => d && setBuyDate(d)} disabled={isEdit} />
        </div>
      </div>

      {/* Buy marketplace */}
      {!isEdit && (
        <div className="space-y-2">
          <Label>Buy Marketplace</Label>
          <Select value={buyMarketplace} onValueChange={(v) => setBuyMarketplace(v as Marketplace)}>
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {MARKETPLACES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sell section */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sellPrice">Sell Price</Label>
          <Input
            id="sellPrice"
            type="text"
            inputMode="numeric"
            placeholder={currency === "STARS" ? "1500" : "5000000000"}
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label>Sell Date</Label>
          <DatePicker date={sellDate} onSelect={setSellDate} />
        </div>
      </div>

      {/* Sell marketplace */}
      {(sellPrice || sellDate) && (
        <div className="space-y-2">
          <Label>Sell Marketplace</Label>
          <Select value={sellMarketplace} onValueChange={(v) => setSellMarketplace(v as Marketplace)}>
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {MARKETPLACES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          placeholder="Optional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : isEdit ? "Update" : "Add trade"}
      </Button>
    </form>
  );
}

interface DatePickerProps {
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  disabled?: boolean;
}

function DatePicker({ date, onSelect, disabled }: DatePickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd.MM.yy") : "Pick date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onSelect(d);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
