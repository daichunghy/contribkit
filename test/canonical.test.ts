import { describe, expect, it } from "vitest";
import { canonicalJson, compareTextUnit, digestCanonical } from "../src/canonical.js";

describe("canonical JSON", () => {
  it("sorts object keys by code unit and is stable", () => {
    const a = canonicalJson({ b: 1, a: 2 });
    const b = canonicalJson({ a: 2, b: 1 });
    expect(a).toBe('{"a":2,"b":1}');
    expect(a).toBe(b);
    expect(digestCanonical({ a: 2, b: 1 })).toBe(digestCanonical({ b: 1, a: 2 }));
  });

  it("does not use localeCompare", () => {
    expect(compareTextUnit("A", "a")).toBe(-1);
    expect(compareTextUnit("a", "a")).toBe(0);
    const keys = ["Z", "a", "B"].sort(compareTextUnit);
    expect(keys).toEqual(["B", "Z", "a"]);
  });
});
