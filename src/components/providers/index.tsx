"use client";

import type { ReactNode } from "react";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <TRPCReactProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster richColors closeButton position="bottom-right" />
      </TooltipProvider>
    </TRPCReactProvider>
  );
}
