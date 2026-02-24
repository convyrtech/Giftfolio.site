"use client";

import { MoreHorizontal, Pencil, Trash2, Eye, EyeOff, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Trade } from "@/server/db/schema";

interface TradeRowActionsProps {
  trade: Trade;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onToggleExclude: () => void;
}

export function TradeRowActions({
  trade,
  onEdit,
  onDelete,
  onToggleHidden,
  onToggleExclude,
}: TradeRowActionsProps): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 min-h-[44px] min-w-[44px]" aria-label={`Actions for ${trade.giftName}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleHidden}>
          {trade.isHidden ? (
            <><Eye className="mr-2 h-4 w-4" />Unhide</>
          ) : (
            <><EyeOff className="mr-2 h-4 w-4" />Hide</>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleExclude}>
          <BarChart3 className="mr-2 h-4 w-4" />
          {trade.excludeFromPnl ? "Count in PnL" : "Don't count"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
