import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "ru", "zh"] as const;
export type Locale = (typeof locales)[number];

/**
 * Detect locale from Accept-Language header.
 * Matches primary language subtag (e.g. "ru-RU" → "ru") against supported locales.
 */
function detectFromHeader(acceptLanguage: string): Locale | undefined {
  const parts = acceptLanguage.split(",");
  for (const part of parts) {
    const lang = part.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
    if (lang && (locales as readonly string[]).includes(lang)) {
      return lang as Locale;
    }
  }
  return undefined;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get("locale")?.value;

  let locale: Locale;
  if (raw && (locales as readonly string[]).includes(raw)) {
    locale = raw as Locale;
  } else {
    const headersList = await headers();
    const acceptLang = headersList.get("accept-language") ?? "";
    locale = detectFromHeader(acceptLang) ?? "en";
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
