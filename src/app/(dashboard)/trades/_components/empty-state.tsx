"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { TradeFormDialog } from "./trade-form-dialog";

export function EmptyState(): React.ReactElement {
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const [showForm, setShowForm] = useState(isOnboarding);

  return (
    <>
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Gift className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold">No trades yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first trade to start tracking profit
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button onClick={() => setShowForm(true)}>Add trade</Button>
          <Link
            href="/settings"
            className="text-xs text-muted-foreground hover:underline"
          >
            Set up commission first
          </Link>
        </div>
      </div>

      <TradeFormDialog open={showForm} onOpenChange={setShowForm} />
    </>
  );
}
