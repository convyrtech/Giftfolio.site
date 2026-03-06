"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import Image from "next/image";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Strip local timezone offset so PostgreSQL `date` column stores the intended calendar date. */
function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
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
import { CommissionOverrideSection } from "./commission-override-section";
import { GiftNameCombobox } from "./gift-name-combobox";

type Marketplace = "fragment" | "getgems" | "tonkeeper" | "p2p" | "other";
type TradeMode = "item" | "collection";

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
  const t = useTranslations("trades");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? t("editTrade") : t("addTrade")}</DialogTitle>
            <DialogDescription className="sr-only">
              {isEdit ? t("editTradeDesc") : t("addTradeDesc")}
            </DialogDescription>
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
          <DrawerTitle>{isEdit ? t("editTrade") : t("addTrade")}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {isEdit ? t("editTradeDesc") : t("addTradeDesc")}
          </DrawerDescription>
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
  const t = useTranslations("trades");
  const tc = useTranslations("common");

  // Mode state (only for add)
  const [mode, setMode] = useState<TradeMode>("item");

  // Form state
  const [giftUrl, setGiftUrl] = useState(trade?.giftLink ?? "");
  const [giftName, setGiftName] = useState(trade?.giftName ?? "");
  const [currency, setCurrency] = useState<"STARS" | "TON">(trade?.tradeCurrency ?? "TON");
  const [buyPrice, setBuyPrice] = useState(trade ? String(trade.buyPrice) : "");
  const [sellPrice, setSellPrice] = useState(
    trade?.sellPrice !== null && trade?.sellPrice !== undefined ? String(trade.sellPrice) : "",
  );
  const [buyDate, setBuyDate] = useState<Date>(trade?.buyDate ?? new Date());
  const [sellDate, setSellDate] = useState<Date | undefined>(trade?.sellDate ?? undefined);
  const [buyMarketplace, setBuyMarketplace] = useState<Marketplace | "">(trade?.buyMarketplace ?? "");
  const [sellMarketplace, setSellMarketplace] = useState<Marketplace | "">(trade?.sellMarketplace ?? "");
  const [notes, setNotes] = useState(trade?.notes ?? "");
  const [quantity, setQuantity] = useState(trade ? String(trade.quantity) : "1");
  const [transferredCount, setTransferredCount] = useState(
    trade?.transferredCount != null ? String(trade.transferredCount) : "",
  );
  function handleQuantityChange(raw: string): void {
    const val = raw.replace(/[^0-9]/g, "");
    setQuantity(val);
    // Reset transferredCount if it exceeds new quantity
    const newQty = parseInt(val, 10);
    const tc = parseInt(transferredCount, 10);
    if (!isNaN(tc) && !isNaN(newQty) && tc > newQty) {
      setTransferredCount("");
    }
  }
  const [excludeFromPnl, setExcludeFromPnl] = useState(trade?.excludeFromPnl ?? false);

  // Commission override
  const [showCommission, setShowCommission] = useState(false);
  const [commissionFlat, setCommissionFlat] = useState(
    trade ? String(trade.commissionFlatStars) : "",
  );
  const [commissionPermille, setCommissionPermille] = useState(
    trade ? String(trade.commissionPermille) : "",
  );

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
      void utils.stats.portfolioValue.invalidate();
      toast.success(t("tradeAdded"));
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
      toast.success(t("tradeUpdated"));
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
          sellDate: sellDate ? toUTCDate(sellDate) : undefined,
          sellMarketplace: sellMarketplace || undefined,
          notes: notes || undefined,
          quantity: quantity ? parseInt(quantity, 10) : undefined,
          transferredCount: transferredCount ? parseInt(transferredCount, 10) : null,
          isHidden: trade.isHidden,
          excludeFromPnl,
          commissionFlatStars: commissionFlat ? BigInt(commissionFlat) : undefined,
          commissionPermille: commissionPermille ? parseInt(commissionPermille, 10) : undefined,
        });
      } else {
        if (mode === "item" && !giftUrl) {
          toast.error(t("giftUrlRequired"));
          return;
        }
        if (mode === "collection" && !giftName) {
          toast.error(t("giftNameRequired"));
          return;
        }
        if (!buyPrice) {
          toast.error(t("buyPriceRequired"));
          return;
        }

        addTrade.mutate({
          giftUrl: mode === "item" ? giftUrl : undefined,
          giftName: mode === "collection" ? giftName : undefined,
          tradeCurrency: currency,
          buyPrice: BigInt(buyPrice),
          buyDate: toUTCDate(buyDate),
          sellPrice: sellPrice ? BigInt(sellPrice) : undefined,
          sellDate: sellDate ? toUTCDate(sellDate) : undefined,
          quantity: parseInt(quantity, 10) || 1,
          transferredCount: transferredCount ? parseInt(transferredCount, 10) : undefined,
          buyMarketplace: buyMarketplace || undefined,
          sellMarketplace: sellMarketplace || undefined,
          excludeFromPnl,
          notes: notes || undefined,
          commissionFlatStars: commissionFlat ? BigInt(commissionFlat) : undefined,
          commissionPermille: commissionPermille ? parseInt(commissionPermille, 10) : undefined,
        });
      }
    } catch {
      toast.error(t("invalidPrice"));
    }
  };

  const isPending = addTrade.isPending || updateTrade.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode toggle (add only) */}
      {!isEdit && (
        <div className="flex gap-1 rounded-md border p-1" role="radiogroup" aria-label={t("tradeMode")}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "item"}
            className={cn(
              "flex-1 rounded px-3 py-1 text-sm font-medium transition-colors",
              mode === "item" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMode("item")}
          >
            {t("modeItem")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "collection"}
            className={cn(
              "flex-1 rounded px-3 py-1 text-sm font-medium transition-colors",
              mode === "collection" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setMode("collection")}
          >
            {t("modeCollection")}
          </button>
        </div>
      )}

      {/* Gift URL (item mode) */}
      {!isEdit && mode === "item" && (
        <div className="space-y-2">
          <Label htmlFor="giftUrl">{t("giftUrl")} *</Label>
          <Input
            id="giftUrl"
            placeholder="https://t.me/nft/EasterEgg-52095"
            value={giftUrl}
            onChange={(e) => handleGiftUrlChange(e.target.value)}
            aria-required="true"
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

      {/* Gift Name (collection mode) */}
      {!isEdit && mode === "collection" && (
        <div className="space-y-2">
          <Label htmlFor="gift-name-combobox">{t("giftName")} *</Label>
          <GiftNameCombobox id="gift-name-combobox" value={giftName} onValueChange={setGiftName} />
        </div>
      )}

      {/* Currency + Quantity row */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("currency")}</Label>
            <Select value={currency} onValueChange={(v) => { if (v === "STARS" || v === "TON") setCurrency(v); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TON">TON</SelectItem>
                <SelectItem value="STARS">Stars</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">{t("quantity")}</Label>
            <Input
              id="quantity"
              type="text"
              inputMode="numeric"
              placeholder="1"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Quantity in edit mode */}
      {isEdit && (
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="text"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
          />
        </div>
      )}

      {/* Transferred count (shown when quantity > 1) */}
      {parseInt(quantity, 10) > 1 && (
        <div className="space-y-2">
          <Label htmlFor="transferredCount">{t("transferredCount")}</Label>
          <Input
            id="transferredCount"
            type="text"
            inputMode="numeric"
            placeholder={t("transferredCountPlaceholder", { qty: quantity })}
            value={transferredCount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              const parsed = parseInt(val, 10);
              const qty = parseInt(quantity, 10);
              if (!isNaN(parsed) && !isNaN(qty) && parsed > qty) return;
              setTransferredCount(val);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("transferredCountHint")}
          </p>
        </div>
      )}

      {/* Buy section */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="buyPrice">{t("buyPrice")}{!isEdit && " *"}</Label>
          <Input
            id="buyPrice"
            type="text"
            inputMode="numeric"
            placeholder={currency === "STARS" ? "1000" : "3500000000"}
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value.replace(/[^0-9]/g, ""))}
            aria-required={!isEdit ? "true" : "false"}
            disabled={isEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("buyDate")}{!isEdit && " *"}</Label>
          <DatePicker date={buyDate} onSelect={(d) => d && setBuyDate(d)} disabled={isEdit} />
        </div>
      </div>

      {/* Buy marketplace */}
      {!isEdit && (
        <div className="space-y-2">
          <Label>{t("buyMarketplace")}</Label>
          <Select value={buyMarketplace} onValueChange={(v) => { if (MARKETPLACES.some((m) => m.value === v)) setBuyMarketplace(v as Marketplace); }}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectPlaceholder")} />
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
          <Label htmlFor="sellPrice">{t("sellPrice")}</Label>
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
          <Label>{t("sellDate")}</Label>
          <DatePicker date={sellDate} onSelect={setSellDate} />
        </div>
      </div>

      {/* Sell marketplace */}
      {(sellPrice || sellDate) && (
        <div className="space-y-2">
          <Label>{t("sellMarketplace")}</Label>
          <Select value={sellMarketplace} onValueChange={(v) => { if (MARKETPLACES.some((m) => m.value === v)) setSellMarketplace(v as Marketplace); }}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectPlaceholder")} />
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

      {/* Commission override (collapsible) */}
      <CommissionOverrideSection
        expanded={showCommission}
        onToggle={() => setShowCommission(!showCommission)}
        flat={commissionFlat}
        onFlatChange={setCommissionFlat}
        permille={commissionPermille}
        onPermilleChange={setCommissionPermille}
      />

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Input
          id="notes"
          placeholder={t("notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>

      {/* Exclude from PnL */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="excludePnl"
          checked={excludeFromPnl}
          onCheckedChange={(checked) => setExcludeFromPnl(checked === true)}
        />
        <Label htmlFor="excludePnl" className="text-sm font-normal">
          {t("excludeFromPnl")}
        </Label>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc("saving") : isEdit ? t("update") : t("addTrade")}
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
  const t = useTranslations("trades");

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
          {date ? format(date, "dd.MM.yy") : t("pickDate")}
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
