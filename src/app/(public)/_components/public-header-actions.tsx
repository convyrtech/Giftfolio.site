"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface PublicHeaderActionsProps {
  isLoggedIn: boolean;
}

export function PublicHeaderActions({ isLoggedIn }: PublicHeaderActionsProps): React.ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const tNav = useTranslations("nav");

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8 min-h-[44px] min-w-[44px] overflow-hidden"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label={tNav("toggleTheme")}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>
      {isLoggedIn && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 min-h-[44px] min-w-[44px]"
          onClick={() => void authClient.signOut()}
          aria-label={tNav("signOut")}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
