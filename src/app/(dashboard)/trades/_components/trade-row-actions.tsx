"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, Eye, EyeOff, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import type { Trade } from "@/server/db/schema";
import { DeleteTradeDialog } from "./delete-trade-dialog";
import { TradeFormDialog } from "./trade-form-dialog";

interface TradeRowActionsProps {
  trade: Trade;
}

export function TradeRowActions({ trade }: TradeRowActionsProps): React.ReactElement {
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const utils = trpc.useUtils();

  const toggleHidden = trpc.trades.toggleHidden.useMutation({
    onSuccess: (updated) => {
      void utils.trades.list.invalidate();
      toast.success(updated.isHidden ? "Trade hidden" : "Trade unhidden");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleExclude = trpc.trades.update.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success(
        trade.excludeFromPnl ? "Trade included in PnL" : "Trade excluded from PnL",
      );
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${trade.giftName}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowEdit(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toggleHidden.mutate({ id: trade.id })}
            disabled={toggleHidden.isPending}
          >
            {trade.isHidden ? (
              <><Eye className="mr-2 h-4 w-4" />Unhide</>
            ) : (
              <><EyeOff className="mr-2 h-4 w-4" />Hide</>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              toggleExclude.mutate({
                id: trade.id,
                excludeFromPnl: !trade.excludeFromPnl,
              })
            }
            disabled={toggleExclude.isPending}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            {trade.excludeFromPnl ? "Count in PnL" : "Don't count"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDelete(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TradeFormDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        trade={trade}
      />
      <DeleteTradeDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        trade={trade}
      />
    </>
  );
}
