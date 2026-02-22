"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import type { Trade } from "@/server/db/schema";
import { columns } from "./columns";
import { EmptyState } from "./empty-state";

interface TradesTableProps {
  currency?: "STARS" | "TON";
  sort?: "buy_date" | "sell_date" | "buy_price" | "sell_price" | "created_at";
  sortDir?: "asc" | "desc";
}

export function TradesTable({ currency, sort, sortDir }: TradesTableProps): React.ReactElement {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.trades.list.useInfiniteQuery(
      { limit: 50, currency, sort, sortDir },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );

  const allTrades = useMemo<Trade[]>(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages],
  );

  const table = useReactTable({
    data: allTrades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
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
        <Table>
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

function TradesTableSkeleton(): React.ReactElement {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Gift</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Bought</TableHead>
            <TableHead>Sold</TableHead>
            <TableHead>Buy Price</TableHead>
            <TableHead>Sell Price</TableHead>
            <TableHead>Profit</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-9 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </TableCell>
              {Array.from({ length: 6 }).map((_, j) => (
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
