"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BarChart3, Settings, LogOut, Gift } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

interface DashboardShellProps {
  user: { id: string; name?: string | null; image?: string | null };
  children: React.ReactNode;
}

const navItems = [
  { href: "/trades", label: "Trades", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardShell({ user, children }: DashboardShellProps): React.ReactElement {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Desktop header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/trades" className="flex items-center gap-2 font-semibold">
              <Gift className="h-5 w-5 text-primary" />
              <span>Giftfolio</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({
                      variant: pathname.startsWith(item.href) ? "secondary" : "ghost",
                      size: "sm",
                    }),
                    "gap-2",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:block">
              {user.name}
            </span>
            {user.image && (
              <Image
                src={user.image}
                alt=""
                width={32}
                height={32}
                className="rounded-full"
                unoptimized
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void authClient.signOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content — pb-16 to avoid overlap with mobile bottom nav */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-20 md:pb-4">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden">
        <div className="flex h-14 items-center justify-around">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-2 text-xs",
                pathname.startsWith(item.href)
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
