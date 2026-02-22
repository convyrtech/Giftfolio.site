"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import type { Trade } from "@/server/db/schema";

interface DeleteTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: Trade;
}

export function DeleteTradeDialog({
  open,
  onOpenChange,
  trade,
}: DeleteTradeDialogProps): React.ReactElement {
  const utils = trpc.useUtils();

  const softDelete = trpc.trades.softDelete.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      onOpenChange(false);

      toast("Trade deleted", {
        action: {
          label: "Undo",
          onClick: () => {
            restore.mutate({ id: trade.id });
          },
        },
        duration: 5000,
      });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const restore = trpc.trades.restore.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success("Trade restored");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete trade?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete trade {trade.giftName}{trade.giftNumber !== null ? ` #${String(trade.giftNumber)}` : ""}? You can undo this within 5 seconds.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => softDelete.mutate({ id: trade.id })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
