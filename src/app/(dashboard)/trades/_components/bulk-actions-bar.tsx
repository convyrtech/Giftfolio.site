"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X, Eye, EyeOff, BarChart3, Trash2, DollarSign, ShoppingCart, Calendar, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc/client";

/** Strip local timezone offset so PostgreSQL `date` column stores today's calendar date. */
function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

interface BulkActionsBarProps {
  selectedIds: bigint[];
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedIds,
  onClearSelection,
}: BulkActionsBarProps): React.ReactElement | null {
  const utils = trpc.useUtils();
  const count = selectedIds.length;
  const tb = useTranslations("bulk");
  const tc = useTranslations("common");

  if (count === 0) return null;

  const invalidateAll = (): void => {
    void utils.trades.list.invalidate();
    void utils.stats.dashboard.invalidate();
    void utils.stats.portfolioValue.invalidate();
    onClearSelection();
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-50 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] supports-[backdrop-filter]:bg-background/60" role="region" aria-label={tb("bulkActions")}>
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <span className="shrink-0 text-sm font-medium" role="status" aria-live="polite" aria-atomic="true">{tb("selected", { count })}</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="mr-1 h-3 w-3" />
          {tc("clear")}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <SetBuyPriceAction ids={selectedIds} onDone={invalidateAll} />
          <SetSellPriceAction ids={selectedIds} onDone={invalidateAll} />
          <SetBuyDateAction ids={selectedIds} onDone={invalidateAll} />
          <SetCommissionAction ids={selectedIds} onDone={invalidateAll} />
          <BulkHideAction ids={selectedIds} hide onDone={invalidateAll} />
          <BulkHideAction ids={selectedIds} hide={false} onDone={invalidateAll} />
          <BulkExcludeAction ids={selectedIds} exclude onDone={invalidateAll} />
          <BulkExcludeAction ids={selectedIds} exclude={false} onDone={invalidateAll} />
          <BulkDeleteAction ids={selectedIds} onDone={invalidateAll} />
        </div>
      </div>
    </div>
  );
}

function SetSellPriceAction({
  ids,
  onDone,
}: {
  ids: bigint[];
  onDone: () => void;
}): React.ReactElement {
  const [price, setPrice] = useState("");
  const [dateStr, setDateStr] = useState(() => todayUTC().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const tb = useTranslations("bulk");
  const tc = useTranslations("common");

  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(tb("updatedCount", { count: data.count }));
      setOpen(false);
      setPrice("");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <DollarSign className="mr-1 h-3 w-3" />
          {tb("sellPrice")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <Input
            placeholder={tb("sellPrice")}
            aria-label={tb("sellPriceLabel")}
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
            autoFocus
          />
          <Input
            type="date"
            aria-label={tb("sellDateLabel")}
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!price || !dateStr || bulkUpdate.isPending}
            onClick={() => {
              const parts = dateStr.split("-").map(Number);
              if (parts.length < 3 || parts.some((n) => isNaN(n))) return;
              bulkUpdate.mutate({
                ids,
                sellPrice: BigInt(price),
                sellDate: new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!)),
              });
            }}
          >
            {bulkUpdate.isPending ? tc("updating") : tc("apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SetBuyPriceAction({
  ids,
  onDone,
}: {
  ids: bigint[];
  onDone: () => void;
}): React.ReactElement {
  const [price, setPrice] = useState("");
  const [open, setOpen] = useState(false);
  const tb = useTranslations("bulk");
  const tc = useTranslations("common");

  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(tb("updatedCount", { count: data.count }));
      setOpen(false);
      setPrice("");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ShoppingCart className="mr-1 h-3 w-3" />
          {tb("buyPrice")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <Input
            placeholder={tb("buyPrice")}
            aria-label={tb("buyPriceLabel")}
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
            autoFocus
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!price || bulkUpdate.isPending}
            onClick={() => {
              bulkUpdate.mutate({ ids, buyPrice: BigInt(price) });
            }}
          >
            {bulkUpdate.isPending ? tc("updating") : tc("apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SetBuyDateAction({
  ids,
  onDone,
}: {
  ids: bigint[];
  onDone: () => void;
}): React.ReactElement {
  const [dateStr, setDateStr] = useState("");
  const [open, setOpen] = useState(false);
  const tb = useTranslations("bulk");
  const tc = useTranslations("common");

  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(tb("updatedCount", { count: data.count }));
      setOpen(false);
      setDateStr("");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Calendar className="mr-1 h-3 w-3" />
          {tb("buyDate")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <Input
            type="date"
            aria-label={tb("buyDateLabel")}
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            autoFocus
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!dateStr || bulkUpdate.isPending}
            onClick={() => {
              const parts = dateStr.split("-").map(Number);
              if (parts.length < 3 || parts.some((n) => isNaN(n))) return;
              bulkUpdate.mutate({ ids, buyDate: new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!)) });
            }}
          >
            {bulkUpdate.isPending ? tc("updating") : tc("apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SetCommissionAction({
  ids,
  onDone,
}: {
  ids: bigint[];
  onDone: () => void;
}): React.ReactElement {
  const [flatInput, setFlatInput] = useState("");
  const [permilleInput, setPermilleInput] = useState("");
  const [open, setOpen] = useState(false);
  const tb = useTranslations("bulk");
  const tc = useTranslations("common");
  const tt = useTranslations("trades");

  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(tb("updatedCount", { count: data.count }));
      setOpen(false);
      setFlatInput("");
      setPermilleInput("");
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const hasValue = flatInput.trim() !== "" || permilleInput.trim() !== "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Percent className="mr-1 h-3 w-3" />
          {tb("commission")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bulk-comm-flat" className="text-xs">{tt("commFlat")}</Label>
            <Input
              id="bulk-comm-flat"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={flatInput}
              onChange={(e) => setFlatInput(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-8"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-comm-permille" className="text-xs">{tt("commRate")}</Label>
            <Input
              id="bulk-comm-permille"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={permilleInput}
              onChange={(e) => setPermilleInput(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-8"
            />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!hasValue || bulkUpdate.isPending}
            onClick={() => {
              const flat = flatInput.trim() === "" ? undefined : BigInt(flatInput.trim());
              const permille = permilleInput.trim() === "" ? undefined : Number(permilleInput.trim());
              bulkUpdate.mutate({
                ids,
                ...(flat !== undefined && { commissionFlatStars: flat }),
                ...(permille !== undefined && { commissionPermille: permille }),
              });
            }}
          >
            {bulkUpdate.isPending ? tc("updating") : tc("apply")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BulkHideAction({
  ids,
  hide,
  onDone,
}: {
  ids: bigint[];
  hide: boolean;
  onDone: () => void;
}): React.ReactElement {
  const tb = useTranslations("bulk");
  const tt = useTranslations("trades");
  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(hide ? tb("hiddenCount", { count: data.count }) : tb("unhiddenCount", { count: data.count }));
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={bulkUpdate.isPending}
      onClick={() => bulkUpdate.mutate({ ids, isHidden: hide })}
    >
      {hide ? (
        <><EyeOff className="mr-1 h-3 w-3" />{tt("hide")}</>
      ) : (
        <><Eye className="mr-1 h-3 w-3" />{tt("unhide")}</>
      )}
    </Button>
  );
}

function BulkExcludeAction({
  ids,
  exclude,
  onDone,
}: {
  ids: bigint[];
  exclude: boolean;
  onDone: () => void;
}): React.ReactElement {
  const tb = useTranslations("bulk");
  const tt = useTranslations("trades");
  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(exclude ? tb("excludedCount", { count: data.count }) : tb("includedCount", { count: data.count }));
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={bulkUpdate.isPending}
      onClick={() => bulkUpdate.mutate({ ids, excludeFromPnl: exclude })}
    >
      <BarChart3 className="mr-1 h-3 w-3" />
      {exclude ? tt("dontCount") : tb("count")}
    </Button>
  );
}

function BulkDeleteAction({
  ids,
  onDone,
}: {
  ids: bigint[];
  onDone: () => void;
}): React.ReactElement {
  const tb = useTranslations("bulk");
  const tc = useTranslations("common");
  const bulkDelete = trpc.trades.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(tb("deletedCount", { count: data.count }));
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={bulkDelete.isPending}
      onClick={() => bulkDelete.mutate({ ids })}
    >
      <Trash2 className="mr-1 h-3 w-3" />
      {tc("delete")}
    </Button>
  );
}
