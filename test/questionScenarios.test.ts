import { describe, expect, it } from "vitest";
import { parseQuery } from "../src/modules/search/queryParser.js";
import { AskService } from "../src/modules/ask/askService.js";
import type { AskResponse, ParsedQuery, SearchResult } from "../src/types/domain.js";

type QuestionCase = {
  q: string;
  expectedCategory: string;
  expected?: (parsed: ParsedQuery) => void;
};

const CASES: QuestionCase[] = [
  {
    q: "где поесть",
    expectedCategory: "food_place"
  },
  {
    q: "аренда байка",
    expectedCategory: "bike_rent"
  },
  {
    q: "апарты на юге",
    expectedCategory: "real_estate_rent",
    expected: (parsed) => {
      expect(parsed.locationMarker).toBe("south");
    }
  },
  {
    q: "снять апарты на юге дешевле 6млн",
    expectedCategory: "real_estate_rent",
    expected: (parsed) => {
      expect(parsed.locationMarker).toBe("south");
      expect(parsed.priceRange).toEqual({ max: 6_000_000 });
    }
  },
  {
    q: "где найти кальян",
    expectedCategory: "food_place"
  },
  {
    q: "нужен байк на две недели без прав",
    expectedCategory: "bike_rent",
    expected: (parsed) => {
      expect(parsed.bikeFilters?.period).toBe("week");
    }
  },
  { q: "нужна работа full time remote", expectedCategory: "job_vacancy" },
  { q: "визаран в лаос", expectedCategory: "visaran" },
  { q: "покер cash сегодня", expectedCategory: "casino_poker" },
  { q: "какие события в городе сегодня", expectedCategory: "city_event" },
  { q: "экскурсия на острова", expectedCategory: "excursions" },
  { q: "бар в центре", expectedCategory: "food_place" },
  { q: "где европейская кухня", expectedCategory: "food_place" },
  { q: "кафе с завтраком", expectedCategory: "food_place" },
  { q: "аренда honda click 125cc на месяц", expectedCategory: "bike_rent" }
];

function buildAskServiceStub(): AskService {
  const fakeSearch = {
    async search(parsed: ParsedQuery): Promise<SearchResult[]> {
      const category = parsed.categories?.[0] ?? "other";
      return [
        {
          messageId: 1,
          chatId: 100,
          date: new Date("2026-03-06T00:00:00.000Z"),
          text: "stub",
          adCategory: category,
          score: 1,
          link: "https://t.me/stub/1"
        },
        {
          messageId: 2,
          chatId: 100,
          date: new Date("2026-03-05T00:00:00.000Z"),
          text: "stub2",
          adCategory: category,
          score: 0.9,
          link: "https://t.me/stub/2"
        }
      ];
    }
  };
  const fakeLlm = {
    async clarify(): Promise<AskResponse> {
      return { mode: "clarification", text: "clarify", sources: [] };
    },
    async answerWithSources(): Promise<AskResponse> {
      return { mode: "llm_answer", text: "fallback", sources: [] };
    }
  };
  return new AskService(fakeSearch as never, fakeLlm as never);
}

describe("question scenarios", () => {
  it("maps scenario questions to expected categories and filters", () => {
    for (const tc of CASES) {
      const parsed = parseQuery(tc.q);
      expect(parsed.categories, tc.q).toContain(tc.expectedCategory);
      expect(parsed.needsClarification, tc.q).toBe(false);
      tc.expected?.(parsed);
    }
  });

  it("returns db_answer for scenario questions with search results", async () => {
    const askService = buildAskServiceStub();
    for (const tc of CASES) {
      const response = await askService.handleQuestion(tc.q);
      expect(response.mode, tc.q).toBe("db_answer");
      expect(response.text.length, tc.q).toBeGreaterThan(0);
    }
  });
});
