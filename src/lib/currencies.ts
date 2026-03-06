// Branded types to prevent mixing Stars and NanoTon
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type Stars = Brand<bigint, "Stars">;
export type NanoTon = Brand<bigint, "NanoTon">;

const NANOTON_DECIMALS = 9;
const NANOTON_MULTIPLIER = 10n ** BigInt(NANOTON_DECIMALS); // 1_000_000_000n

// Fixed Stars/USD rate (Telegram pricing)
export const STARS_USD_RATE = 0.013;

/**
 * Parse user TON input string to NanoTon using string arithmetic.
 * NEVER use parseFloat — floating-point errors at scale.
 *
 * Examples:
 *   "3.5" → 3_500_000_000n
 *   "0.001" → 1_000_000n
 *   "100" → 100_000_000_000n
 */
export function parseTonInput(input: string): NanoTon {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === ".") {
    throw new Error("Invalid TON input: empty");
  }

  const parts = trimmed.split(".");
  if (parts.length > 2) {
    throw new Error("Invalid TON input: multiple decimal points");
  }

  const wholePart = parts[0] ?? "0";
  let fracPart = parts[1] ?? "";

  // Validate: only digits allowed
  if (!/^\d+$/.test(wholePart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) {
    throw new Error("Invalid TON input: non-numeric characters");
  }

  // Truncate fractional part to 9 decimal places (nanoton precision)
  if (fracPart.length > NANOTON_DECIMALS) {
    fracPart = fracPart.slice(0, NANOTON_DECIMALS);
  }

  // Pad fractional part to 9 digits
  fracPart = fracPart.padEnd(NANOTON_DECIMALS, "0");

  const nanotons = BigInt(wholePart) * NANOTON_MULTIPLIER + BigInt(fracPart);
  return nanotons as NanoTon;
}

/**
 * Format NanoTon bigint to human-readable string.
 * "3.50 TON" — dot decimal (crypto convention)
 * Handles negative values correctly (for profit display).
 */
export function formatTon(nanotons: NanoTon): string {
  const sign = nanotons < 0n ? "-" : "";
  const abs = nanotons < 0n ? -nanotons : nanotons;
  const whole = abs / NANOTON_MULTIPLIER;
  const frac = abs % NANOTON_MULTIPLIER;

  // Remove trailing zeros, keep at least 2 decimal places
  let fracStr = frac.toString().padStart(NANOTON_DECIMALS, "0");
  fracStr = fracStr.replace(/0+$/, "");
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, "0");

  return `${sign}${whole}.${fracStr} TON`;
}

/**
 * Convert TON string to NanoTon.
 * Alias for parseTonInput for external API values.
 */
export function toNanoTon(value: string): NanoTon {
  return parseTonInput(value);
}

/**
 * Parse Stars input — simple integer parsing.
 * Stars are always whole numbers.
 */
export function parseStarsInput(input: string): Stars {
  const trimmed = input.trim();
  if (trimmed === "" || !/^\d+$/.test(trimmed)) {
    throw new Error("Invalid Stars input: must be a positive integer");
  }
  return BigInt(trimmed) as Stars;
}

/**
 * Format Stars bigint to display string.
 * Uses Intl.NumberFormat which natively supports BigInt.
 * "1 234 ★" — space separator, star symbol
 */
export function formatStars(stars: Stars): string {
  return `${new Intl.NumberFormat("ru-RU").format(stars)} ★`;
}

/**
 * Convert Stars to NanoTon using a rate string (Stars per 1 TON).
 * Rate is expressed as "how many Stars = 1 TON" (e.g. "770" means 770 Stars = 1 TON).
 * Returns nanoton equivalent of the given Stars amount.
 */
export function starsToNanoton(stars: Stars, rateStr: string): NanoTon {
  // rate = Stars per 1 TON. So nanoton = stars / rate * 1e9
  // To avoid floating point: nanoton = stars * 1e9 / rateParsed
  // Parse rate string to a rational with 9 decimal places precision
  const parts = rateStr.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";
  frac = frac.padEnd(9, "0").slice(0, 9);
  const rateBig = BigInt(whole) * NANOTON_MULTIPLIER + BigInt(frac); // rate in "nano-Stars" units
  if (rateBig === 0n) return 0n as NanoTon;
  // stars * 1e9 * 1e9 / rateBig = nanoton
  const result = (stars * NANOTON_MULTIPLIER * NANOTON_MULTIPLIER) / rateBig;
  return result as NanoTon;
}

/**
 * Convert NanoTon to Stars using a rate string (Stars per 1 TON).
 */
export function nanotonToStars(nanotons: NanoTon, rateStr: string): Stars {
  // rate = Stars per 1 TON. So stars = nanotons * rate / 1e9
  const parts = rateStr.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";
  frac = frac.padEnd(9, "0").slice(0, 9);
  const rateBig = BigInt(whole) * NANOTON_MULTIPLIER + BigInt(frac);
  // stars = nanotons * rateBig / (1e9 * 1e9)
  const result = (nanotons * rateBig) / (NANOTON_MULTIPLIER * NANOTON_MULTIPLIER);
  return result as Stars;
}

/**
 * Format NanoTon to raw TON number string (for calculations/display without suffix).
 * Handles negative values correctly.
 */
export function nanoTonToTonString(nanotons: NanoTon): string {
  const sign = nanotons < 0n ? "-" : "";
  const abs = nanotons < 0n ? -nanotons : nanotons;
  const whole = abs / NANOTON_MULTIPLIER;
  const frac = abs % NANOTON_MULTIPLIER;
  let fracStr = frac.toString().padStart(NANOTON_DECIMALS, "0");
  fracStr = fracStr.replace(/0+$/, "");
  if (fracStr.length === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${fracStr}`;
}
