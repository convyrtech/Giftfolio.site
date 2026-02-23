"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type RowSelectionState,
} from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import type { Trade } from "@/server/db/schema";
import { columns, type TradesTableMeta } from "./columns";
import { EmptyState } from "./empty-state";
import { TradeFormDialog } from "./trade-form-dialog";
import { DeleteTradeDialog } from "./delete-trade-dialog";

interface TradesTableProps {
  currency?: "STARS" | "TON";
  sort?: "buy_date" | "sell_date" | "buy_price" | "sell_price" | "created_at";
  sortDir?: "asc" | "desc";
  showHidden?: boolean;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (selection: RowSelectionState) => void;
}

export function TradesTable({
  currency,
  sort,
  sortDir,
  showHidden,
  rowSelection,
  onRowSelectionChange,
}: TradesTableProps): React.ReactElement {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);
  const [deleteTrade, setDeleteTrade] = useState<Trade | null>(null);
  const utils = trpc.useUtils();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.trades.list.useInfiniteQuery(
      { limit: 50, currency, sort, sortDir, showHidden },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        maxPages: 20,
      },
    );

  const toggleHidden = trpc.trades.toggleHidden.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success("Visibility updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleExclude = trpc.trades.toggleExclude.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success("PnL setting updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: floorPrices = {} } = trpc.market.floorPrices.useQuery(undefined, {
    staleTime: 60 * 60 * 1000, // 1h — matches server cache TTL
  });

  const tableMeta: TradesTableMeta = {
    onEdit: setEditTrade,
    onDelete: setDeleteTrade,
    onToggleHidden: (trade) => toggleHidden.mutate({ id: trade.id }),
    onToggleExclude: (trade) => toggleExclude.mutate({ id: trade.id }),
    floorPrices,
  };

  const allTrades = useMemo<Trade[]>(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages],
  );

  const table = useReactTable({
    data: allTrades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    meta: tableMeta,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onRowSelectionChange(next);
    },
  });

  // Stable refs so the IntersectionObserver callback never goes stale
  const canFetchRef = useRef(false);
  canFetchRef.current = hasNextPage === true && !isFetchingNextPage;
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && canFetchRef.current) {
          void fetchRef.current();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (isLoading) {
    return <TradesTableSkeleton />;
  }

  if (allTrades.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <div className="rounded-md border">
        <Table aria-label="Trades list">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const trade = row.original;
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(
                    row.getIsSelected() && "bg-accent/50",
                    trade.isHidden && "opacity-50",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">Loading more trades</span>
        </div>
      )}

      {/* Lifted dialogs — single instance for entire table */}
      <TradeFormDialog
        open={editTrade !== null}
        onOpenChange={(open) => { if (!open) setEditTrade(null); }}
        trade={editTrade ?? undefined}
      />
      {deleteTrade && (
        <DeleteTradeDialog
          open
          onOpenChange={(open) => { if (!open) setDeleteTrade(null); }}
          trade={deleteTrade}
        />
      )}
    </div>
  );
}

function TradesTableSkeleton(): React.ReactElement {
  return (
    <div className="rounded-md border" role="status" aria-label="Loading trades">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Gift</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Bought</TableHead>
            <TableHead>Sold</TableHead>
            <TableHead>Buy Price</TableHead>
            <TableHead>Sell Price</TableHead>
            <TableHead>Profit</TableHead>
            <TableHead>Floor / PnL</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-9 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </TableCell>
              {Array.from({ length: 7 }).map((_, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              ))}
              <TableCell>
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
