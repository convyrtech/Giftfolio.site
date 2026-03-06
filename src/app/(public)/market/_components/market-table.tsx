"use client";

import Image from "next/image";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type Column,
  type ColumnDef,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type GiftBubbleItem, getCollectionImageUrl } from "@/lib/gift-bubbles";

interface MarketTableProps {
  items: GiftBubbleItem[];
  available: boolean;
}

const col = createColumnHelper<GiftBubbleItem>();

function useMarketColumns(): ColumnDef<GiftBubbleItem>[] {
  const t = useTranslations("market");
  return useMemo(() => [
    col.display({
      id: "image",
      header: "",
      cell: ({ row }) => {
        const name = row.original.name;
        const src = getCollectionImageUrl(name);
        return (
          <Image
            src={src}
            alt={name}
            width={32}
            height={32}
            className="rounded-md object-cover"
            unoptimized
          />
        );
      },
      size: 40,
      enableSorting: false,
    }),
    col.accessor("name", {
      header: t("columnGift"),
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue()}</span>
      ),
    }),
    col.accessor("floorprice", {
      header: ({ column }) => <SortHeader label={t("columnFloor")} column={column} />,
      cell: ({ getValue }) => (
        <span className="tabular-nums">{getValue().toFixed(1)} TON</span>
      ),
    }),
    col.accessor("floorprice_usd", {
      header: ({ column }) => <SortHeader label={t("columnUsd")} column={column} />,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-muted-foreground">${getValue().toFixed(2)}</span>
      ),
    }),
    col.accessor("change", {
      header: ({ column }) => <SortHeader label={t("column24h")} column={column} />,
      cell: ({ getValue }) => <ChangeCell value={getValue()} />,
    }),
    col.accessor("change_7d", {
      header: ({ column }) => <SortHeader label={t("column7d")} column={column} />,
      cell: ({ getValue }) => <ChangeCell value={getValue()} />,
    }),
    col.accessor("volume", {
      header: ({ column }) => <SortHeader label={t("columnListings")} column={column} />,
      cell: ({ getValue }) => (
        <span className="tabular-nums text-muted-foreground">{getValue()}</span>
      ),
    }),
  ] as ColumnDef<GiftBubbleItem>[], [t]);
}

export function MarketTable({ items, available }: MarketTableProps): React.ReactElement {
  const t = useTranslations("market");
  const columns = useMarketColumns();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "floorprice", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    // Filter by name column only — prevents matching numeric fields like "1"
    globalFilterFn: (row, _columnId, filterValue: string) =>
      row.original.name.toLowerCase().includes(filterValue.toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!available) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
        {t("unavailable")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label={t("searchGifts")}
          placeholder={t("searchPlaceholder")}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("filteredOf", { filtered: table.getFilteredRowModel().rows.length, total: items.length })}
      </p>
    </div>
  );
}

function ChangeCell({ value }: { value: number }): React.ReactElement {
  const isPositive = value > 0;
  const isNegative = value < 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        isPositive && "text-profit",
        isNegative && "text-loss",
        !isPositive && !isNegative && "text-muted-foreground",
      )}
    >
      {isPositive ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function SortHeader({
  label,
  column,
}: {
  label: string;
  column: Column<GiftBubbleItem, unknown>;
}): React.ReactElement {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className="flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
