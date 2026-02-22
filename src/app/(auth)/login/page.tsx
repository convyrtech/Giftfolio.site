import type { Metadata } from "next";
import { TelegramLoginButton } from "./_components/telegram-login-button";

export const metadata: Metadata = {
  title: "Login — Giftfolio",
  description: "Sign in with your Telegram account to track gift trades",
};

export default function LoginPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Giftfolio</h1>
        <p className="text-muted-foreground text-sm">
          Track your Telegram gift trades & PnL
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <TelegramLoginButton />
        <p className="text-muted-foreground text-xs">
          Sign in securely via Telegram
        </p>
      </div>
    </main>
  );
}
