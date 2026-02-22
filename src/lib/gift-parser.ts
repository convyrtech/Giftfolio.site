export interface ParsedGift {
  /** PascalCase name, e.g. "PlushPepe" */
  name: string;
  /** Gift number */
  number: number;
  /** Slug for URLs: "PlushPepe-123" */
  slug: string;
  /** Display name with spaces: "Plush Pepe" */
  displayName: string;
  /** Lowercase name for image URLs: "plushpepe" */
  nameLower: string;
}

/**
 * Parse Telegram gift URL to extract gift name and number.
 *
 * URL formats:
 *   t.me/nft/PlushPepe-123
 *   https://t.me/nft/PlushPepe-123
 *
 * Slug format: "PlushPepe-123"
 *
 * IMPORTANT: Split on LAST hyphen — gift names can contain hyphens.
 * Example: "Jelly-Fish-42" → name="Jelly-Fish", number=42
 *
 * Returns null for invalid input (not throw).
 */
export function parseGiftUrl(input: string): ParsedGift | null {
  const trimmed = input.trim();

  // Extract slug from URL or use as-is
  let slug: string;
  const urlMatch = trimmed.match(/(?:https?:\/\/)?t\.me\/nft\/(.+)/);
  if (urlMatch) {
    slug = urlMatch[1]!;
  } else if (/^[A-Za-z][\w-]*-\d+$/.test(trimmed)) {
    // Direct slug format
    slug = trimmed;
  } else {
    return null;
  }

  // Split on LAST hyphen
  const lastHyphen = slug.lastIndexOf("-");
  if (lastHyphen === -1 || lastHyphen === 0) return null;

  const name = slug.slice(0, lastHyphen);
  const numberStr = slug.slice(lastHyphen + 1);

  if (!/^\d+$/.test(numberStr) || numberStr === "0") return null;
  const number = parseInt(numberStr, 10);
  if (isNaN(number) || number <= 0) return null;

  // Validate name: must be PascalCase-ish (starts with uppercase letter)
  if (!/^[A-Z]/.test(name)) return null;

  return {
    name,
    number,
    slug: `${name}-${number}`,
    displayName: pascalCaseToSpaces(name),
    nameLower: name.toLowerCase(),
  };
}

/**
 * Convert PascalCase to spaced display name.
 * "PlushPepe" → "Plush Pepe"
 * "Jelly-Fish" → "Jelly Fish"
 * "NFTCard" → "NFT Card"
 */
function pascalCaseToSpaces(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

/**
 * Build gift image URL for Fragment CDN.
 * Format: nft.fragment.com/gift/{name_lower}-{number}.webp
 */
export function getGiftImageUrl(nameLower: string, number: number): string {
  return `https://nft.fragment.com/gift/${nameLower}-${number}.webp`;
}

/**
 * Build Telegram gift URL.
 * Format: t.me/nft/{PascalName}-{Number}
 */
export function getGiftTelegramUrl(slug: string): string {
  return `https://t.me/nft/${slug}`;
}
