"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("trades");
  const tc = useTranslations("common");

  const softDelete = trpc.trades.softDelete.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      onOpenChange(false);

      toast(t("tradeDeleted"), {
        action: {
          label: t("undo"),
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
      toast.success(t("tradeRestored"));
    },
  });

  const tradeName = trade.giftName + (trade.giftNumber !== null ? ` #${String(trade.giftNumber)}` : "");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTradeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteTradeDesc", { name: tradeName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => softDelete.mutate({ id: trade.id })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {tc("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
