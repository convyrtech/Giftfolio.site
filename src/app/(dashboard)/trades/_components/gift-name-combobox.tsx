"use client";

import { useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { formatStars, type Stars } from "@/lib/currencies";

interface GiftNameComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}

export function GiftNameCombobox({
  value,
  onValueChange,
  id,
}: GiftNameComboboxProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { data: catalog = [], isLoading, isError } = trpc.gifts.catalog.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
  });

  const selected = catalog.find((g) => g.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select gift collection"
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.displayName : "Search gift..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search gift..." />
          <CommandList>
            {isLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading gifts...</div>
            )}
            {isError && (
              <div className="py-6 text-center text-sm text-destructive">Failed to load gifts</div>
            )}
            <CommandEmpty>No gift found.</CommandEmpty>
            <CommandGroup>
              {catalog.map((gift) => (
                <CommandItem
                  key={gift.name}
                  value={gift.name}
                  keywords={[gift.displayName]}
                  onSelect={() => {
                    onValueChange(gift.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === gift.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{gift.displayName}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {formatStars(BigInt(gift.floorStars) as Stars)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
