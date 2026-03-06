import { describe, expect, it } from "vitest";
import { buildSearchFilter } from "../src/modules/search/buildSearchFilter.js";

describe("buildSearchFilter", () => {
  it("builds mandatory filters and text search", () => {
    const parsed = {
      keywords: ["rent", "bike"],
      needsClarification: false
    };
    const filter = buildSearchFilter({
      parsed,
      allowedChatIds: [1, 2],
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "rent bike"
    });
    expect(filter.status).toBeDefined();
    expect(filter.chat_id).toEqual({ $in: [1, 2] });
    expect(filter.$text).toEqual({ $search: "rent bike" });
  });

  it("builds bike filters from structured extracted_bike fields", () => {
    const parsed = {
      keywords: ["байк"],
      categories: ["bike_rent"],
      bikeFilters: {
        dealType: "rent",
        brand: "honda",
        model: "click",
        engineCc: 125,
        location: "north",
        period: "month"
      },
      needsClarification: false
    };
    const filter = buildSearchFilter({
      parsed: parsed as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "байк"
    });
    expect(filter["extracted_bike.is_bike_ad"]).toBe(true);
    expect(filter["extracted_bike.deal_type"]).toBe("rent");
    expect(filter["extracted_bike.engine_cc"]).toBe(125);
    expect(filter["extracted_bike.price_primary.period"]).toBe("month");
    expect(filter.$or).toEqual([
      { "extracted_bike.location.normalized": "north" },
      { "extracted_bike.location.district": "north" }
    ]);
  });
});
