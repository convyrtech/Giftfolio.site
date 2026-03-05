import { cache } from "react";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { Gift } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/server/auth";
import { PublicNav } from "./_components/public-nav";
import { PublicHeaderActions } from "./_components/public-header-actions";

// Deduplicate session fetch across layout + any child RSC in the same render tree.
const getSession = cache(async () => {
  const headersList = await headers();
  return auth.api.getSession({ headers: headersList });
});

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href={session ? "/trades" : "/market"}
              className="flex items-center gap-2 font-semibold"
            >
              <Gift className="h-5 w-5 text-primary" />
              <span>Giftfolio</span>
            </Link>
            {session && (
              <nav className="hidden md:flex" aria-label="Main navigation">
                <PublicNav />
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="hidden text-sm text-muted-foreground md:block">
                  {session.user.name}
                </span>
                {session.user.image && (
                  <Image
                    src={session.user.image}
                    alt={session.user.name ?? "User avatar"}
                    width={32}
                    height={32}
                    className="rounded-full"
                    unoptimized
                  />
                )}
              </>
            ) : (
              <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
                Sign in with Telegram
              </Link>
            )}
            <PublicHeaderActions isLoggedIn={!!session} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-4">
        {children}
      </main>

      {session && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden"
          aria-label="Mobile navigation"
        >
          <PublicNav mobile />
        </nav>
      )}
    </div>
  );
}
