import { describe, expect, it } from "vitest";
import { AskService } from "../src/modules/ask/askService.js";
import { parseQuery } from "../src/modules/search/queryParser.js";
import type { AskResponse, SearchResult } from "../src/types/domain.js";

type PhraseCase = {
  phrase: string;
  expectedCategory: string;
};

const PHRASE_CASES: PhraseCase[] = [
  { phrase: "где снять квартиру у моря", expectedCategory: "real_estate_rent" },
  { phrase: "ищу апартаменты на месяц", expectedCategory: "real_estate_rent" },
  { phrase: "аренда condo в центре", expectedCategory: "real_estate_rent" },
  { phrase: "нужна студия долгосрок", expectedCategory: "real_estate_rent" },
  { phrase: "снять комнату недорого", expectedCategory: "real_estate_rent" },

  { phrase: "нужен байк на месяц", expectedCategory: "bike_rent" },
  { phrase: "аренда скутера yamaha", expectedCategory: "bike_rent" },
  { phrase: "есть bike rent на неделю", expectedCategory: "bike_rent" },
  { phrase: "ищу мото в аренду", expectedCategory: "bike_rent" },
  { phrase: "honda scooter на долгосрок", expectedCategory: "bike_rent" },

  { phrase: "посоветуйте кафе рядом", expectedCategory: "food_place" },
  { phrase: "лучший ресторан в центре", expectedCategory: "food_place" },
  { phrase: "где хороший бар вечером", expectedCategory: "food_place" },
  { phrase: "нужна кофейня с завтраком", expectedCategory: "food_place" },
  { phrase: "where to eat food tonight", expectedCategory: "food_place" },

  { phrase: "есть вакансия для курьера", expectedCategory: "job_vacancy" },
  { phrase: "ищем официант в смену", expectedCategory: "job_vacancy" },
  { phrase: "работа на ресепшн", expectedCategory: "job_vacancy" },
  { phrase: "job vacancy in service", expectedCategory: "job_vacancy" },
  { phrase: "hiring staff urgently", expectedCategory: "job_vacancy" },

  { phrase: "какие события в городе сегодня", expectedCategory: "city_event" },
  { phrase: "мероприятия на выходных", expectedCategory: "city_event" },
  { phrase: "есть ивенты в пятницу", expectedCategory: "city_event" },
  { phrase: "концерт или фестиваль сегодня", expectedCategory: "city_event" },
  { phrase: "party meetup tonight", expectedCategory: "city_event" },

  { phrase: "обмен usd vnd сегодня", expectedCategory: "currency_exchange" },
  { phrase: "актуальный курс usdt", expectedCategory: "currency_exchange" },
  { phrase: "меняю руб на донги", expectedCategory: "currency_exchange" },
  { phrase: "currency exchange rub", expectedCategory: "currency_exchange" },
  { phrase: "курс доллара сейчас", expectedCategory: "currency_exchange" },

  { phrase: "где покер турнир", expectedCategory: "casino_poker" },
  { phrase: "казино рядом с центром", expectedCategory: "casino_poker" },
  { phrase: "roulette tonight", expectedCategory: "casino_poker" },
  { phrase: "ставки и бет в клубе", expectedCategory: "casino_poker" },
  { phrase: "blackjack table open", expectedCategory: "casino_poker" },

  { phrase: "кто делает визаран", expectedCategory: "visaran" },
  { phrase: "нужен visa run на границу", expectedCategory: "visaran" },
  { phrase: "border run завтра", expectedCategory: "visaran" },
  { phrase: "помощь с продлением визы", expectedCategory: "visaran" },
  { phrase: "виза ран недорого", expectedCategory: "visaran" },

  { phrase: "хочу экскурсию на острова", expectedCategory: "excursions" },
  { phrase: "туры на два дня", expectedCategory: "excursions" },
  { phrase: "нужен гид по городу", expectedCategory: "excursions" },
  { phrase: "дайвинг trip завтра", expectedCategory: "excursions" },
  { phrase: "tour around islands", expectedCategory: "excursions" },

  { phrase: "нужны услуги ремонта", expectedCategory: "other_services" },
  { phrase: "сервис доставки по району", expectedCategory: "other_services" },
  { phrase: "уборка квартиры быстро", expectedCategory: "other_services" },
  { phrase: "мастер по кондиционерам", expectedCategory: "other_services" },
  { phrase: "service for home fixing", expectedCategory: "other_services" }
];

async function buildFallbackReport(): Promise<{ fallbackRate: number; fallbackPhrases: string[] }> {
  const fakeSearchService = {
    async search(parsed: { categories?: string[]; keywords: string[] }): Promise<SearchResult[]> {
      if (!parsed.categories?.length) {
        return [];
      }
      const category = parsed.categories[0] ?? "other";
      return [
        {
          messageId: 1,
          chatId: 100,
          chatTitle: "stub",
          date: new Date(),
          text: "stub result 1",
          adCategory: category,
          score: 1,
          link: "https://t.me/stub/1"
        },
        {
          messageId: 2,
          chatId: 100,
          chatTitle: "stub",
          date: new Date(),
          text: "stub result 2",
          adCategory: category,
          score: 0.9,
          link: "https://t.me/stub/2"
        }
      ];
    }
  };

  const fakeLlmService = {
    async clarify(): Promise<AskResponse> {
      return { mode: "clarification", text: "clarify", sources: [] };
    },
    async answerWithSources(): Promise<AskResponse> {
      return { mode: "llm_answer", text: "fallback", sources: [] };
    }
  };

  const askService = new AskService(fakeSearchService as never, fakeLlmService as never);
  const fallbackPhrases: string[] = [];

  for (const testCase of PHRASE_CASES) {
    const response = await askService.handleQuestion(testCase.phrase);
    if (response.mode !== "db_answer") {
      fallbackPhrases.push(testCase.phrase);
    }
  }

  return {
    fallbackRate: fallbackPhrases.length / PHRASE_CASES.length,
    fallbackPhrases
  };
}

describe("50-phrase coverage and fallback rate", () => {
  it("maps 50 phrases to expected categories", () => {
    expect(PHRASE_CASES).toHaveLength(50);
    for (const testCase of PHRASE_CASES) {
      const parsed = parseQuery(testCase.phrase);
      expect(parsed.categories, testCase.phrase).toContain(testCase.expectedCategory);
      expect(parsed.needsClarification, testCase.phrase).toBe(false);
    }
  });

  it("keeps fallback rate under 30% for these 50 phrases", async () => {
    const report = await buildFallbackReport();
    expect(report.fallbackRate).toBeLessThanOrEqual(0.3);
  });

  it("prints fallback report with exact percent and phrase list", async () => {
    const report = await buildFallbackReport();
    const percent = (report.fallbackRate * 100).toFixed(2);
    console.info(`[fallback-report] rate=${percent}% count=${report.fallbackPhrases.length}/${PHRASE_CASES.length}`);
    console.info(
      `[fallback-report] phrases=${report.fallbackPhrases.length > 0 ? report.fallbackPhrases.join(" | ") : "(none)"}`
    );
    expect(report.fallbackRate).toBeLessThanOrEqual(0.3);
  });
});
