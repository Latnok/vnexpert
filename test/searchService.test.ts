import { describe, expect, it } from "vitest";
import { prioritizeByLocationMarker } from "../src/modules/search/searchService.js";
import type { ParsedQuery, SearchResult } from "../src/types/domain.js";
import { SearchService } from "../src/modules/search/searchService.js";

function mkResult(id: number, district?: string): SearchResult {
  return {
    messageId: id,
    chatId: 1,
    date: new Date("2026-03-06T00:00:00.000Z"),
    text: `item-${id}`,
    adCategory: "real_estate_rent",
    score: 1,
    realEstate: district
      ? {
          location: {
            district
          }
        }
      : {}
  };
}

describe("prioritizeByLocationMarker", () => {
  it("puts marker matches first, then unknown, then others", () => {
    const results = [mkResult(1, "north"), mkResult(2), mkResult(3, "south"), mkResult(4, "center")];
    const parsed: ParsedQuery = {
      keywords: ["апарты", "юге"],
      categories: ["real_estate_rent"],
      locationMarker: "south",
      needsClarification: false
    };

    const ranked = prioritizeByLocationMarker(results, parsed);
    expect(ranked.map((r) => r.messageId)).toEqual([3, 2, 1, 4]);
  });
});

describe("SearchService currency fallback window", () => {
  it("widens to default lookback when 24h window has no currency results", async () => {
    const calls: Array<{ dateFrom: Date; dateTo: Date }> = [];
    const now = Date.now();
    const repo = {
      async searchMessages(params: { dateFrom: Date; dateTo: Date }): Promise<SearchResult[]> {
        calls.push({ dateFrom: params.dateFrom, dateTo: params.dateTo });
        if (calls.length === 1) {
          return [];
        }
        return [
          {
            messageId: 999,
            chatId: 1,
            date: new Date(now - 2 * 24 * 60 * 60 * 1000),
            text: "usd exchange",
            adCategory: "currency_exchange",
            score: 1
          }
        ];
      }
    };

    const service = new SearchService(repo as never);
    const parsed: ParsedQuery = {
      keywords: [],
      categories: ["currency_exchange"],
      needsClarification: false
    };

    const results = await service.search(parsed);
    expect(results.length).toBe(1);
    expect(calls.length).toBe(2);

    const firstWindowMs = calls[0]!.dateTo.getTime() - calls[0]!.dateFrom.getTime();
    const secondWindowMs = calls[1]!.dateTo.getTime() - calls[1]!.dateFrom.getTime();
    expect(firstWindowMs).toBeLessThanOrEqual(26 * 60 * 60 * 1000);
    expect(secondWindowMs).toBeGreaterThan(firstWindowMs);
  });
});

describe("SearchService real-estate suspicious price cleanup", () => {
  it("drops entries where monthly price equals management fee", async () => {
    const repo = {
      async searchMessages(): Promise<SearchResult[]> {
        return [
          {
            messageId: 1,
            chatId: 1,
            date: new Date("2026-03-06T10:00:00.000Z"),
            text: "bad",
            adCategory: "real_estate_rent",
            score: 1,
            realEstate: {
              price_primary: { amount: 700000, period: "month" },
              other_expenses: { management_fee_vnd_per_person: 700000 },
              location: { district: "north" }
            }
          },
          {
            messageId: 2,
            chatId: 1,
            date: new Date("2026-03-06T09:00:00.000Z"),
            text: "good",
            adCategory: "real_estate_rent",
            score: 1,
            realEstate: {
              price_primary: { amount: 10000000, period: "month" },
              location: { district: "north" }
            }
          }
        ];
      }
    };

    const service = new SearchService(repo as never);
    const parsed: ParsedQuery = {
      keywords: ["апарты"],
      categories: ["real_estate_rent"],
      locationMarker: "north",
      needsClarification: false
    };
    const results = await service.search(parsed);
    expect(results.map((r) => r.messageId)).toEqual([2]);
  });
});

describe("SearchService bike fallback", () => {
  it("relaxes bike query by dropping keywords when strict search returns empty", async () => {
    const calls: ParsedQuery[] = [];
    const repo = {
      async searchMessages(params: { parsed: ParsedQuery }): Promise<SearchResult[]> {
        calls.push(params.parsed);
        if (calls.length === 1) {
          return [];
        }
        return [
          {
            messageId: 77,
            chatId: 1,
            date: new Date("2026-03-06T10:00:00.000Z"),
            text: "bike ad",
            adCategory: "bike_rent",
            score: 1
          }
        ];
      }
    };

    const service = new SearchService(repo as never);
    const parsed: ParsedQuery = {
      keywords: ["снять", "байк", "неделю"],
      categories: ["bike_rent"],
      bikeFilters: { period: "week", dealType: "rent" },
      needsClarification: false
    };
    const results = await service.search(parsed);

    expect(results.map((r) => r.messageId)).toEqual([77]);
    expect(calls.length).toBe(2);
    expect(calls[0]?.keywords).toEqual(["снять", "байк", "неделю"]);
    expect(calls[1]?.keywords).toEqual([]);
    expect(calls[1]?.bikeFilters?.period).toBe("week");
  });

  it("drops bike period when relaxed-by-text query still returns empty", async () => {
    const calls: ParsedQuery[] = [];
    const repo = {
      async searchMessages(params: { parsed: ParsedQuery }): Promise<SearchResult[]> {
        calls.push(params.parsed);
        if (calls.length < 3) {
          return [];
        }
        return [
          {
            messageId: 88,
            chatId: 1,
            date: new Date("2026-03-06T10:00:00.000Z"),
            text: "bike ad without explicit period",
            adCategory: "bike_rent",
            score: 1
          }
        ];
      }
    };

    const service = new SearchService(repo as never);
    const parsed: ParsedQuery = {
      keywords: ["байк", "неделя"],
      categories: ["bike_rent"],
      bikeFilters: { period: "week", dealType: "rent", brand: "honda" },
      needsClarification: false
    };
    const results = await service.search(parsed);

    expect(results.map((r) => r.messageId)).toEqual([88]);
    expect(calls.length).toBe(3);
    expect(calls[1]?.keywords).toEqual([]);
    expect(calls[1]?.bikeFilters?.period).toBe("week");
    expect(calls[2]?.keywords).toEqual([]);
    expect(calls[2]?.bikeFilters?.period).toBeUndefined();
    expect(calls[2]?.bikeFilters?.brand).toBe("honda");
    expect(calls[2]?.bikeFilters?.dealType).toBe("rent");
  });

  it("drops bike dealType when query still returns empty after period relaxation", async () => {
    const calls: ParsedQuery[] = [];
    const repo = {
      async searchMessages(params: { parsed: ParsedQuery }): Promise<SearchResult[]> {
        calls.push(params.parsed);
        if (calls.length < 4) {
          return [];
        }
        return [
          {
            messageId: 99,
            chatId: 1,
            date: new Date("2026-03-06T10:00:00.000Z"),
            text: "bike ad with unknown deal type",
            adCategory: "bike_rent",
            score: 1
          }
        ];
      }
    };

    const service = new SearchService(repo as never);
    const parsed: ParsedQuery = {
      keywords: ["куплю", "байк"],
      categories: ["bike_rent"],
      bikeFilters: { dealType: "sale", period: "week", brand: "honda" },
      needsClarification: false
    };
    const results = await service.search(parsed);

    expect(results.map((r) => r.messageId)).toEqual([99]);
    expect(calls.length).toBe(4);
    expect(calls[0]?.bikeFilters?.dealType).toBe("sale");
    expect(calls[1]?.keywords).toEqual([]);
    expect(calls[2]?.bikeFilters?.period).toBeUndefined();
    expect(calls[2]?.bikeFilters?.dealType).toBe("sale");
    expect(calls[3]?.bikeFilters?.dealType).toBeUndefined();
    expect(calls[3]?.bikeFilters?.brand).toBe("honda");
  });
});

describe("SearchService food leak cleanup", () => {
  it("drops rent listings misclassified as food_place", async () => {
    const repo = {
      async searchMessages(): Promise<SearchResult[]> {
        return [
          {
            messageId: 1,
            chatId: 1,
            date: new Date("2026-03-06T10:00:00.000Z"),
            text: "Сдается студия, рестораны и кафе рядом, депозит за 1 месяц, кухня и кондиционер",
            adCategory: "food_place",
            score: 1
          },
          {
            messageId: 2,
            chatId: 1,
            date: new Date("2026-03-06T09:00:00.000Z"),
            text: "Кафе домашней кухни, сегодня в меню суп и шашлык",
            adCategory: "food_place",
            score: 1
          }
        ];
      }
    };

    const service = new SearchService(repo as never);
    const parsed: ParsedQuery = {
      keywords: ["кафе"],
      categories: ["food_place"],
      needsClarification: false
    };

    const results = await service.search(parsed);
    expect(results.map((r) => r.messageId)).toEqual([2]);
  });
});
