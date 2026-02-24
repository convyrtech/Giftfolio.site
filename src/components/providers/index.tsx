"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NetworkBanner } from "@/components/network-banner";

export function Providers({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <TRPCReactProvider>
        <TooltipProvider delayDuration={300}>
          <NetworkBanner />
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </TooltipProvider>
      </TRPCReactProvider>
    </ThemeProvider>
  );
}
