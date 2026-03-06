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
