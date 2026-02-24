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
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Gift className="h-10 w-10 text-muted-foreground/60" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-medium">No trades yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first trade to start tracking profit
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Add trade</Button>
        <Link
          href="/settings"
          className="text-xs text-muted-foreground hover:underline"
        >
          Set up commission first
        </Link>
      </div>

      <TradeFormDialog open={showForm} onOpenChange={setShowForm} />
    </>
  );
}
