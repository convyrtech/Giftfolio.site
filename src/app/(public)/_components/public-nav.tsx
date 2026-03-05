"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navItems } from "@/lib/nav-items";

export function PublicNav({ mobile = false }: { mobile?: boolean }): React.ReactElement {
  const pathname = usePathname();

  if (mobile) {
    return (
      <div className="flex h-14 items-center justify-around">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-4 text-xs",
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
    );
  }

  return (
    <div className="flex items-center gap-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname.startsWith(item.href) ? "page" : undefined}
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
    </div>
  );
}
