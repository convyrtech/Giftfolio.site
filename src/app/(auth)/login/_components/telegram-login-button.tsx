"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    __telegram_auth_callback?: (user: TelegramUser) => void;
  }
}

export function TelegramLoginButton(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleAuth = useCallback(
    async (user: TelegramUser) => {
      try {
        setError(null);
        // Detect user timezone
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const res = await fetch("/api/auth/telegram/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...user, timezone }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Authentication failed");
          return;
        }

        const data = await res.json();
        router.push(data.redirect ?? "/trades");
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    },
    [router],
  );

  useEffect(() => {
    const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    if (!botName || !containerRef.current) return;

    // Expose callback for Telegram widget
    window.__telegram_auth_callback = handleAuth;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "__telegram_auth_callback(user)");

    const container = containerRef.current;
    container.appendChild(script);

    return () => {
      delete window.__telegram_auth_callback;
      container.innerHTML = "";
    };
  }, [handleAuth]);

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!botName) {
    return (
      <p className="text-destructive text-sm">
        Bot not configured. Contact administrator.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={containerRef} className="flex items-center justify-center" />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
