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

  it("builds extracted filters for food/visaran/job/event/casino/excursions", () => {
    const base = {
      keywords: ["x"],
      needsClarification: false
    };
    const food = buildSearchFilter({
      parsed: { ...base, categories: ["food_place"], foodFilters: { area: "center", primaryCuisine: "local", cuisineTag: "burger" } } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "food"
    });
    expect(food["extracted_food.location.area.normalized"]).toBe("center");
    expect(food["extracted_food.primary_cuisine"]).toBe("local");
    expect(food["extracted_food.cuisine_tags"]).toBe("burger");

    const visaran = buildSearchFilter({
      parsed: { ...base, categories: ["visaran"], visaranFilters: { direction: "laos" }, priceRange: { max: 1000 } } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "visaran"
    });
    expect(visaran["extracted_visaran.direction_primary"]).toBe("laos");
    expect(visaran["extracted_visaran.price_primary.amount"].$lte).toBe(1000);

    const job = buildSearchFilter({
      parsed: { ...base, categories: ["job_vacancy"], jobFilters: { workFormat: "remote", employmentType: "full_time" }, priceRange: { min: 500 } } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "job"
    });
    expect(job["extracted_job.work_format"]).toBe("remote");
    expect(job["extracted_job.employment_type"]).toBe("full_time");
    expect(job["extracted_job.salary_primary.amount"].$gte).toBe(500);

    const city = buildSearchFilter({
      parsed: { ...base, categories: ["city_event"], cityEventFilters: { ticketRequired: true }, priceRange: { max: 200 } } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "event"
    });
    expect(city["extracted_city_event.ticket_required"]).toBe(true);
    expect(city["extracted_city_event.price_primary.amount"].$lte).toBe(200);

    const casino = buildSearchFilter({
      parsed: { ...base, categories: ["casino_poker"], casinoFilters: { gameType: "poker", pokerFormat: "cash" }, priceRange: { min: 100 } } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "casino"
    });
    expect(casino["extracted_casino_poker.game_type"]).toBe("poker");
    expect(casino["extracted_casino_poker.poker_format"]).toBe("cash");
    expect(casino["extracted_casino_poker.buy_in_primary.amount"].$gte).toBe(100);

    const excursions = buildSearchFilter({
      parsed: { ...base, categories: ["excursions"], excursionFilters: { tourType: "islands" }, priceRange: { max: 300 } } as never,
      dateFrom: new Date("2026-03-01T00:00:00.000Z"),
      dateTo: new Date("2026-03-02T00:00:00.000Z"),
      textSearch: "tour"
    });
    expect(excursions["extracted_excursions.tour_type"]).toBe("islands");
    expect(excursions["extracted_excursions.price_primary.amount"].$lte).toBe(300);
  });
});
