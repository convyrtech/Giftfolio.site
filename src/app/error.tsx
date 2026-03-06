"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  const t = useTranslations("error");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {t("description")}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">{t("errorId", { digest: error.digest })}</p>
      )}
      <Button onClick={reset} variant="outline">
        {t("tryAgain")}
      </Button>
    </div>
  );
}
