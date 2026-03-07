"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type RowSelectionState,
} from "@tanstack/react-table";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTradeColumns, type TradesTableMeta } from "./columns";
import { EmptyState } from "./empty-state";
import { TradeFormDialog } from "./trade-form-dialog";
import { DeleteTradeDialog } from "./delete-trade-dialog";

interface TradesTableProps {
  currency?: "STARS" | "TON";
  sort?: "buy_date" | "sell_date" | "buy_price" | "sell_price" | "created_at" | "sort_order";
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
  const columns = useTradeColumns();
  const t = useTranslations("trades");
  const isCustomSort = sort === "sort_order";

  // Cap in-memory pages to prevent unbounded growth (50 items × 20 pages = 1,000 trades max)
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
      toast.success(t("visibilityUpdated"));
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleExclude = trpc.trades.toggleExclude.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      toast.success(t("pnlSettingUpdated"));
    },
    onError: (err) => toast.error(err.message),
  });

  const inlineUpdate = trpc.trades.update.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
      void utils.stats.dashboard.invalidate();
      void utils.analytics.invalidate();
      toast.success(t("inlineSaved"));
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMutation = trpc.trades.reorder.useMutation({
    onSuccess: () => {
      void utils.trades.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
      void utils.trades.list.invalidate();
    },
  });

  const { data: floorPrices = {} } = trpc.market.floorPrices.useQuery(undefined, {
    staleTime: 60 * 60 * 1000, // 1h — matches server cache TTL
  });

  const tableMeta: TradesTableMeta = {
    onEdit: setEditTrade,
    onDelete: setDeleteTrade,
    onToggleHidden: (trade) => toggleHidden.mutate({ id: trade.id }),
    onToggleExclude: (trade) => toggleExclude.mutate({ id: trade.id }),
    onInlineUpdate: async (id, fields) => {
      await inlineUpdate.mutateAsync({ id, ...fields });
    },
    floorPrices,
    isCustomSort,
  };

  const serverTrades = useMemo<Trade[]>(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages],
  );

  // Optimistic reorder: stores reordered trades + the data.pages ref they were based on.
  // When server data changes (invalidation after mutation), the key won't match
  // and we fall back to serverTrades. No ref, no useEffect — pure derivation.
  const [optimistic, setOptimistic] = useState<{ trades: Trade[]; pagesKey: unknown } | null>(null);
  const allTrades = optimistic !== null && optimistic.pagesKey === data?.pages ? optimistic.trades : serverTrades;

  // DnD sensors — pointer with activation constraint to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rowIds = useMemo(() => allTrades.map((t) => String(t.id)), [allTrades]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = allTrades.findIndex((t) => String(t.id) === String(active.id));
      const newIndex = allTrades.findIndex((t) => String(t.id) === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(allTrades, oldIndex, newIndex);

      // Optimistically update UI immediately (keyed to current server data)
      setOptimistic({ trades: reordered, pagesKey: data?.pages });

      // Assign new sort orders: index-based, spaced by 10 for future insertions
      const items = reordered.map((trade, idx) => ({
        id: trade.id,
        sortOrder: (idx + 1) * 10,
      }));

      reorderMutation.mutate({ items });
    },
    [allTrades, reorderMutation, data?.pages],
  );

  // Hide detail columns on mobile — show only Gift + Profit + Actions
  const isMobile = useMediaQuery("(max-width: 767px)");
  const columnVisibility = useMemo(
    () => ({
      tradeCurrency: !isMobile,
      buyDate: !isMobile,
      sellDate: !isMobile,
      buyPrice: !isMobile,
      sellPrice: !isMobile,
      commission: !isMobile,
      buyMarketplace: !isMobile,
      sellMarketplace: !isMobile,
      notes: !isMobile,
      unrealizedPnl: !isMobile,
      dragHandle: isCustomSort && !isMobile,
    }),
    [isMobile, isCustomSort],
  );

  const table = useReactTable({
    data: allTrades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    meta: tableMeta,
    state: { rowSelection, columnVisibility },
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

  const tableContent = (
    <div className="rounded-md border">
      <Table aria-label={t("tradesList")}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() }}
                  className="bg-muted/50 text-xs uppercase tracking-wider font-medium text-muted-foreground"
                >
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
            return isCustomSort ? (
              <SortableTableRow
                key={row.id}
                id={row.id}
                isSelected={row.getIsSelected()}
                isHidden={trade.isHidden}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </SortableTableRow>
            ) : (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={cn(
                  "even:bg-muted/30",
                  row.getIsSelected() && "bg-accent/40",
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
  );

  return (
    <div>
      {isCustomSort ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            {tableContent}
          </SortableContext>
        </DndContext>
      ) : (
        tableContent
      )}

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="sr-only">{t("loadingMore")}</span>
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

// Sortable table row wrapper for DnD
function SortableTableRow({
  id,
  isSelected,
  isHidden,
  children,
}: {
  id: string;
  isSelected: boolean;
  isHidden: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-state={isSelected ? "selected" : undefined}
      className={cn(
        "even:bg-muted/30",
        isSelected && "bg-accent/40",
        isHidden && "opacity-50",
        isDragging && "bg-accent/60 shadow-lg",
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </TableRow>
  );
}

function TradesTableSkeleton(): React.ReactElement {
  const t = useTranslations("trades");
  return (
    <div className="rounded-md border" role="status" aria-label={t("columnGift")}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>{t("columnGift")}</TableHead>
            <TableHead>{t("columnCurrency")}</TableHead>
            <TableHead>{t("columnBought")}</TableHead>
            <TableHead>{t("columnSold")}</TableHead>
            <TableHead>{t("columnBuyPrice")}</TableHead>
            <TableHead>{t("columnSellPrice")}</TableHead>
            <TableHead>{t("columnProfit")}</TableHead>
            <TableHead>{t("columnFloorPnl")}</TableHead>
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
