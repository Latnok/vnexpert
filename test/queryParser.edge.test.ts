import { describe, expect, it } from "vitest";
import { parseQuery } from "../src/modules/search/queryParser.js";

describe("parseQuery edge cases", () => {
  it("requires clarification for empty and noisy input", () => {
    const empty = parseQuery("   ");
    expect(empty.needsClarification).toBe(true);

    const noise = parseQuery("... ??? !!!");
    expect(noise.needsClarification).toBe(true);
  });

  it("does not classify excursion phrase as currency by substring", () => {
    const parsed = parseQuery("экскурсия на острова");
    expect(parsed.categories).toContain("excursions");
    expect(parsed.categories).not.toContain("currency_exchange");
  });

  it("keeps food priority over real_estate in mixed phrasing", () => {
    const parsed = parseQuery("где поесть и снять апарты");
    expect(parsed.categories).toContain("food_place");
    expect(parsed.categories).not.toContain("real_estate_rent");
  });

  it("does not set bike location for unknown district words", () => {
    const parsed = parseQuery("аренда байка в районе xyz на месяц");
    expect(parsed.categories).toContain("bike_rent");
    expect(parsed.bikeFilters?.location).toBeUndefined();
    expect(parsed.bikeFilters?.period).toBe("month");
  });

  it("ignores malformed price comparators", () => {
    const parsed = parseQuery("апарты до abc");
    expect(parsed.priceRange).toBeUndefined();
    expect(parsed.needsClarification).toBe(false);
  });
});
