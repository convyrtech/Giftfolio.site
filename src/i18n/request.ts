import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "ru", "zh"] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("locale")?.value;
  const locale: Locale = raw && (locales as readonly string[]).includes(raw)
    ? (raw as Locale)
    : "en";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
