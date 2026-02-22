import { describe, expect, it } from "vitest";
import { parseGiftUrl, getGiftImageUrl, getGiftTelegramUrl } from "../gift-parser";

describe("parseGiftUrl", () => {
  it("parses full HTTPS URL", () => {
    const result = parseGiftUrl("https://t.me/nft/PlushPepe-123");
    expect(result).toEqual({
      name: "PlushPepe",
      number: 123,
      slug: "PlushPepe-123",
      displayName: "Plush Pepe",
      nameLower: "plushpepe",
    });
  });

  it("parses URL without protocol", () => {
    const result = parseGiftUrl("t.me/nft/PlushPepe-123");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("PlushPepe");
  });

  it("parses HTTP URL", () => {
    const result = parseGiftUrl("http://t.me/nft/PlushPepe-123");
    expect(result).not.toBeNull();
  });

  it("parses direct slug", () => {
    const result = parseGiftUrl("PlushPepe-123");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("PlushPepe");
    expect(result!.number).toBe(123);
  });

  it("handles multi-hyphen names (split on LAST hyphen)", () => {
    const result = parseGiftUrl("t.me/nft/Jelly-Fish-42");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Jelly-Fish");
    expect(result!.number).toBe(42);
    expect(result!.displayName).toBe("Jelly Fish");
  });

  it("handles triple-hyphen names", () => {
    const result = parseGiftUrl("Star-Dust-Box-99");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Star-Dust-Box");
    expect(result!.number).toBe(99);
  });

  it("returns null for empty string", () => {
    expect(parseGiftUrl("")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(parseGiftUrl("https://example.com/not-a-gift")).toBeNull();
  });

  it("returns null for missing number", () => {
    expect(parseGiftUrl("PlushPepe")).toBeNull();
  });

  it("returns null for number zero", () => {
    expect(parseGiftUrl("PlushPepe-0")).toBeNull();
  });

  it("returns null for lowercase start", () => {
    expect(parseGiftUrl("plushPepe-123")).toBeNull();
  });

  it("returns null for just a number", () => {
    expect(parseGiftUrl("123")).toBeNull();
  });

  it("handles whitespace", () => {
    const result = parseGiftUrl("  PlushPepe-123  ");
    expect(result).not.toBeNull();
    expect(result!.number).toBe(123);
  });

  it("generates correct display name for PascalCase", () => {
    const result = parseGiftUrl("GoldenDragonFire-1");
    expect(result!.displayName).toBe("Golden Dragon Fire");
  });

  it("handles acronym in name correctly", () => {
    const result = parseGiftUrl("NFTCard-1");
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("NFT Card");
  });
});

describe("getGiftImageUrl", () => {
  it("builds correct Fragment CDN URL", () => {
    expect(getGiftImageUrl("plushpepe", 123)).toBe(
      "https://nft.fragment.com/gift/plushpepe-123.webp",
    );
  });
});

describe("getGiftTelegramUrl", () => {
  it("builds correct Telegram URL", () => {
    expect(getGiftTelegramUrl("PlushPepe-123")).toBe("https://t.me/nft/PlushPepe-123");
  });
});
