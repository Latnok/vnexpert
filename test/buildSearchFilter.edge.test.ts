import { describe, expect, it } from "vitest";
import { buildSearchFilter } from "../src/modules/search/buildSearchFilter.js";

describe("buildSearchFilter edge cases", () => {
  it("does not add bike location OR when location is missing", () => {
    const filter = buildSearchFilter({
      parsed: {
        keywords: ["байк"],
        categories: ["bike_rent"],
        bikeFilters: { dealType: "rent" },
        needsClarification: false
      } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "байк"
    });
    expect(filter["extracted_bike.is_bike_ad"]).toBe(true);
    expect(filter["extracted_bike.deal_type"]).toBe("rent");
    expect(filter.$or).toBeUndefined();
  });

  it("routes price range to real-estate path by default", () => {
    const filter = buildSearchFilter({
      parsed: {
        keywords: ["апарты"],
        categories: ["real_estate_rent"],
        priceRange: { min: 5_000_000, max: 7_000_000 },
        needsClarification: false
      } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "апарты"
    });
    expect(filter["extracted_real_estate.price_primary.amount"].$gte).toBe(5_000_000);
    expect(filter["extracted_real_estate.price_primary.amount"].$lte).toBe(7_000_000);
  });

  it("builds AND filters for multiple currency pairs", () => {
    const filter = buildSearchFilter({
      parsed: {
        keywords: ["курс"],
        categories: ["currency_exchange"],
        currencyPairs: ["vnd_rub", "vnd_usd"],
        needsClarification: false
      } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "курс"
    });
    expect(filter.$and).toEqual([
      { "extracted_currency.vnd_rub": { $ne: null } },
      { "extracted_currency.vnd_usd": { $ne: null } }
    ]);
  });
});
