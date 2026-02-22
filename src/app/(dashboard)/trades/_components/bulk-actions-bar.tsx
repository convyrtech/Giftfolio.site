"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Eye, EyeOff, BarChart3, Trash2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { trpc } from "@/lib/trpc/client";

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

  if (count === 0) return null;

  const invalidateAll = (): void => {
    void utils.trades.list.invalidate();
    void utils.stats.dashboard.invalidate();
    void utils.stats.portfolioValue.invalidate();
    onClearSelection();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <span className="shrink-0 text-sm font-medium">{count} selected</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <SetSellPriceAction ids={selectedIds} onDone={invalidateAll} />
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
  const [open, setOpen] = useState(false);

  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated ${data.count} trades`);
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
          Sell price
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-2">
          <Input
            placeholder="Sell price"
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
              bulkUpdate.mutate({
                ids,
                sellPrice: BigInt(price),
                sellDate: new Date(),
              });
            }}
          >
            {bulkUpdate.isPending ? "Updating..." : "Apply"}
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
  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(`${hide ? "Hidden" : "Unhidden"} ${data.count} trades`);
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
        <><EyeOff className="mr-1 h-3 w-3" />Hide</>
      ) : (
        <><Eye className="mr-1 h-3 w-3" />Unhide</>
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
  const bulkUpdate = trpc.trades.bulkUpdate.useMutation({
    onSuccess: (data) => {
      toast.success(`${exclude ? "Excluded" : "Included"} ${data.count} trades from PnL`);
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
      {exclude ? "Don't count" : "Count"}
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
  const bulkDelete = trpc.trades.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.count} trades`);
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
      Delete
    </Button>
  );
}
