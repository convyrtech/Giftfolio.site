import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TelegramLoginButton } from "./_components/telegram-login-button";

export const metadata: Metadata = {
  title: "Login — Giftfolio",
  description: "Sign in with your Telegram account to track gift trades",
};

export default async function LoginPage(): Promise<React.ReactElement> {
  const t = await getTranslations("login");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("subtitle")}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <TelegramLoginButton />
        <p className="text-muted-foreground text-xs">
          {t("signInHint")}
        </p>
      </div>
    </main>
  );
}
