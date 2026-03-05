import { describe, it, expect } from "vitest";
import { parseGiftNftName, buildGiftSlug } from "../ton-import";

describe("parseGiftNftName", () => {
  it("parses standard gift name with number", () => {
    expect(parseGiftNftName("Easter Egg #1234")).toEqual({
      giftName: "Easter Egg",
      giftNumber: 1234,
    });
  });

  it("parses single-word gift name", () => {
    expect(parseGiftNftName("Durov #999")).toEqual({
      giftName: "Durov",
      giftNumber: 999,
    });
  });

  it("parses multi-word gift name", () => {
    expect(parseGiftNftName("Plush Pepe #42000")).toEqual({
      giftName: "Plush Pepe",
      giftNumber: 42000,
    });
  });

  it("parses name with apostrophe", () => {
    expect(parseGiftNftName("Durov's Cap #100")).toEqual({
      giftName: "Durov's Cap",
      giftNumber: 100,
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseGiftNftName("  Easter Egg #5  ")).toEqual({
      giftName: "Easter Egg",
      giftNumber: 5,
    });
  });

  it("returns null for name without #number", () => {
    expect(parseGiftNftName("Easter Egg")).toBeNull();
  });

  it("returns null for DNS name (e.g. domain.ton)", () => {
    expect(parseGiftNftName("domain.ton")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGiftNftName("")).toBeNull();
  });

  it("returns null if number is zero", () => {
    expect(parseGiftNftName("Easter Egg #0")).toBeNull();
  });

  it("returns null if number is negative", () => {
    expect(parseGiftNftName("Easter Egg #-5")).toBeNull();
  });

  it("returns null if hash is in the middle (not last segment)", () => {
    // "#1234 Collection" — number is not at the end
    expect(parseGiftNftName("#1234 Collection")).toBeNull();
  });

  it("handles large gift numbers", () => {
    expect(parseGiftNftName("Rare Gem #9999999")).toEqual({
      giftName: "Rare Gem",
      giftNumber: 9999999,
    });
  });
});

describe("buildGiftSlug", () => {
  it("converts name to lowercase and appends number", () => {
    expect(buildGiftSlug("Easter Egg", 1234)).toBe("easteregg-1234");
  });

  it("strips spaces from gift name", () => {
    expect(buildGiftSlug("Plush Pepe", 42)).toBe("plushpepe-42");
  });

  it("strips apostrophes", () => {
    expect(buildGiftSlug("Durov's Cap", 100)).toBe("durovscap-100");
  });

  it("strips hyphens from name part", () => {
    expect(buildGiftSlug("Star-Fish", 7)).toBe("starfish-7");
  });

  it("handles single-word gift name", () => {
    expect(buildGiftSlug("Durov", 5)).toBe("durov-5");
  });

  it("preserves numbers in gift name", () => {
    expect(buildGiftSlug("Gift2024", 1)).toBe("gift2024-1");
  });
});
