import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carryTripBrief, saveTripBrief } from "../tripBrief";

describe("frontend brief continuity", () => {
  let items: Map<string, string>;
  beforeEach(() => {
    items = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("preserves the traveller's exact interests through multiple destination replacements", () => {
    const brief = { description: "I like jazz. Avoid large festivals.", interests: "Jazz, quiet museums" };
    saveTripBrief("original", brief);
    carryTripBrief("original", "taipei");
    carryTripBrief("taipei", "bangkok");
    expect(JSON.parse(items.get("eh:brief:bangkok")!)).toEqual(brief);
    expect(JSON.parse(items.get("eh:brief:original")!)).toEqual(brief);
  });
  it("does not attach an unrelated pending description to an older trip", () => {
    saveTripBrief("another-trip", { description: "I prefer museums." });
    carryTripBrief("unknown-trip", "new-trip");
    expect(items.has("eh:brief:new-trip")).toBe(false);
  });
});
