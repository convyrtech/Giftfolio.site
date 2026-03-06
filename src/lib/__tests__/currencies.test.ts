import { describe, expect, it } from "vitest";
import superjson from "superjson";
import {
  parseTonInput,
  formatTon,
  toNanoTon,
  parseStarsInput,
  formatStars,
  nanoTonToTonString,
  starsToNanoton,
  nanotonToStars,
  type Stars,
  type NanoTon,
} from "../currencies";

describe("parseTonInput", () => {
  it("parses whole number", () => {
    expect(parseTonInput("100")).toBe(100_000_000_000n);
  });

  it("parses decimal", () => {
    expect(parseTonInput("3.5")).toBe(3_500_000_000n);
  });

  it("parses small decimal", () => {
    expect(parseTonInput("0.001")).toBe(1_000_000n);
  });

  it("parses minimum nanoton", () => {
    expect(parseTonInput("0.000000001")).toBe(1n);
  });

  it("truncates beyond 9 decimals", () => {
    expect(parseTonInput("1.1234567899")).toBe(1_123_456_789n);
  });

  it("parses zero", () => {
    expect(parseTonInput("0")).toBe(0n);
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseTonInput("  3.5  ")).toBe(3_500_000_000n);
  });

  it("throws on empty string", () => {
    expect(() => parseTonInput("")).toThrow("Invalid TON input: empty");
  });

  it("throws on just a dot", () => {
    expect(() => parseTonInput(".")).toThrow("Invalid TON input: empty");
  });

  it("throws on multiple dots", () => {
    expect(() => parseTonInput("1.2.3")).toThrow("multiple decimal points");
  });

  it("throws on non-numeric", () => {
    expect(() => parseTonInput("abc")).toThrow("non-numeric");
  });

  it("throws on negative", () => {
    expect(() => parseTonInput("-1")).toThrow("non-numeric");
  });
});

describe("formatTon", () => {
  it("formats whole TON", () => {
    expect(formatTon(100_000_000_000n as NanoTon)).toBe("100.00 TON");
  });

  it("formats fractional TON", () => {
    expect(formatTon(3_500_000_000n as NanoTon)).toBe("3.50 TON");
  });

  it("formats small amount", () => {
    expect(formatTon(1_000_000n as NanoTon)).toBe("0.001 TON");
  });

  it("formats single nanoton", () => {
    expect(formatTon(1n as NanoTon)).toBe("0.000000001 TON");
  });

  it("formats zero", () => {
    expect(formatTon(0n as NanoTon)).toBe("0.00 TON");
  });
});

describe("nanoTonToTonString", () => {
  it("converts whole TON", () => {
    expect(nanoTonToTonString(5_000_000_000n as NanoTon)).toBe("5");
  });

  it("converts fractional TON", () => {
    expect(nanoTonToTonString(3_500_000_000n as NanoTon)).toBe("3.5");
  });
});

describe("parseStarsInput", () => {
  it("parses valid integer", () => {
    expect(parseStarsInput("1234")).toBe(1234n);
  });

  it("parses zero", () => {
    expect(parseStarsInput("0")).toBe(0n);
  });

  it("throws on decimal", () => {
    expect(() => parseStarsInput("1.5")).toThrow("positive integer");
  });

  it("throws on empty", () => {
    expect(() => parseStarsInput("")).toThrow("positive integer");
  });

  it("throws on negative", () => {
    expect(() => parseStarsInput("-5")).toThrow("positive integer");
  });
});

describe("formatStars", () => {
  it("formats with star symbol", () => {
    const result = formatStars(1234n as Stars);
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("★");
  });

  it("formats large number with separators", () => {
    const result = formatStars(1_234_567n as Stars);
    expect(result).toContain("★");
    // Russian locale uses different space types, just check parts exist
    expect(result).toMatch(/1.*234.*567.*★/);
  });

  it("formats zero", () => {
    expect(formatStars(0n as Stars)).toBe("0 ★");
  });

  it("formats value beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
    // 9_007_199_254_740_993 > Number.MAX_SAFE_INTEGER (9_007_199_254_740_991)
    const result = formatStars(9_007_199_254_740_993n as Stars);
    expect(result).toContain("★");
    // If BigInt is coerced to Number, the last digits would change
    expect(result).toContain("993");
  });
});

describe("superjson round-trip", () => {
  it("preserves NanoTon through serialize/deserialize", () => {
    const original = toNanoTon("3.500000001");
    const serialized = superjson.serialize(original);
    const deserialized = superjson.deserialize<bigint>(serialized);
    expect(deserialized).toBe(original);
  });

  it("preserves Stars through serialize/deserialize", () => {
    const original = parseStarsInput("999999");
    const serialized = superjson.serialize(original);
    const deserialized = superjson.deserialize<bigint>(serialized);
    expect(deserialized).toBe(original);
  });

  it("preserves large BigInt values", () => {
    const large = BigInt("9007199254740993"); // > Number.MAX_SAFE_INTEGER
    const serialized = superjson.serialize(large);
    const deserialized = superjson.deserialize<bigint>(serialized);
    expect(deserialized).toBe(large);
  });
});

describe("starsToNanoton", () => {
  it("converts Stars to NanoTon at integer rate", () => {
    // 770 Stars = 1 TON. So 770 Stars → 1_000_000_000 nanoton
    const result = starsToNanoton(770n as Stars, "770");
    expect(result).toBe(1_000_000_000n);
  });

  it("converts Stars to NanoTon at fractional rate", () => {
    // 770.5 Stars = 1 TON. So 770.5 Stars → 1e9 nanoton
    const result = starsToNanoton(BigInt(7705) as Stars, "770.5");
    // 7705 / 770.5 = 10.0 TON = 10_000_000_000 nanoton
    expect(result).toBe(10_000_000_000n);
  });

  it("returns 0 for zero rate", () => {
    expect(starsToNanoton(100n as Stars, "0")).toBe(0n);
  });

  it("handles negative Stars (loss scenario)", () => {
    // -770 Stars at rate 770 = -1 TON
    const result = starsToNanoton(-770n as Stars, "770");
    expect(result).toBe(-1_000_000_000n);
  });

  it("handles small amounts", () => {
    // 1 Star at rate 770 = 1/770 TON ≈ 0.001298701 TON
    const result = starsToNanoton(1n as Stars, "770");
    // 1e9 / 770 = 1298701 (truncated)
    expect(result).toBe(1298701n);
  });
});

describe("nanotonToStars", () => {
  it("converts NanoTon to Stars at integer rate", () => {
    // 1 TON at rate 770 = 770 Stars
    const result = nanotonToStars(1_000_000_000n as NanoTon, "770");
    expect(result).toBe(770n);
  });

  it("converts large NanoTon amounts", () => {
    // 10 TON at rate 770 = 7700 Stars
    const result = nanotonToStars(10_000_000_000n as NanoTon, "770");
    expect(result).toBe(7700n);
  });

  it("handles negative amounts (loss)", () => {
    // -1 TON at rate 770 = -770 Stars
    const result = nanotonToStars(-1_000_000_000n as NanoTon, "770");
    expect(result).toBe(-770n);
  });

  it("roundtrip: Stars → NanoTon → Stars preserves value", () => {
    const original = 7700n as Stars;
    const nanoton = starsToNanoton(original, "770");
    const back = nanotonToStars(nanoton, "770");
    expect(back).toBe(original);
  });
});
