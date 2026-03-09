import { describe, expect, it, vi } from "vitest";
import { AskService } from "../src/modules/ask/askService.js";
import type { AskResponse, SearchResult } from "../src/types/domain.js";

describe("AskService", () => {
  it("returns beach cams links for beach markers and bypasses DB/LLM", async () => {
    const searchService = {
      search: vi.fn(async (): Promise<SearchResult[]> => [])
    };
    const llmService = {
      clarify: vi.fn(async (): Promise<AskResponse> => ({ mode: "clarification", text: "clarify", sources: [] })),
      answerWithSources: vi.fn(async (): Promise<AskResponse> => ({ mode: "llm_answer", text: "fallback", sources: [] }))
    };

    const service = new AskService(searchService as never, llmService as never);
    const result1 = await service.handleQuestion("что на пляже");
    const result2 = await service.handleQuestion("как на пляже");

    expect(result1.mode).toBe("db_answer");
    expect(result1.text).toContain("Камеры по Нячангу (пляжи):");
    expect(result1.text).toContain("windfinder.com");
    expect(result2.mode).toBe("db_answer");
    expect(result2.text).toContain("webcamtaxi.com");
    expect(searchService.search).not.toHaveBeenCalled();
    expect(llmService.answerWithSources).not.toHaveBeenCalled();
  });

  it("returns weather forecast for weather marker and bypasses DB search", async () => {
    const searchService = {
      search: vi.fn(async (): Promise<SearchResult[]> => [])
    };
    const llmService = {
      clarify: vi.fn(async (): Promise<AskResponse> => ({ mode: "clarification", text: "clarify", sources: [] })),
      answerWithSources: vi.fn(async (): Promise<AskResponse> => ({ mode: "llm_answer", text: "fallback", sources: [] }))
    };
    const weatherService = {
      getTodayForecast: vi.fn(async () => ({
        date: "2026-03-07",
        weatherCode: 61,
        tempMinC: 24.2,
        tempMaxC: 30.8,
        precipitationProbabilityMax: 45,
        windSpeedMaxKmh: 18.3
      }))
    };

    const service = new AskService(searchService as never, llmService as never, undefined, undefined, weatherService as never);
    const result = await service.handleQuestion("какая погода сегодня?");

    expect(result.mode).toBe("db_answer");
    expect(result.text).toContain("☀️ Погода в Нячанге на сегодня (2026-03-07):");
    expect(result.text).toContain("Скорее всего дождь, 24..31°C, ветер: до 18 км/ч");
    expect(result.text).toContain("Камеры по Нячангу (пляжи):");
    expect(result.text).toContain("windfinder.com");
    expect(searchService.search).not.toHaveBeenCalled();
    expect(llmService.answerWithSources).not.toHaveBeenCalled();
  });

  it("returns db_answer for single currency result (no fallback)", async () => {
    const searchService = {
      search: vi.fn(async (): Promise<SearchResult[]> => [
        {
          messageId: 1,
          chatId: 100,
          date: new Date(),
          text: "Обмен валют",
          adCategory: "currency_exchange",
          score: 0.9,
          link: "https://t.me/c/100/1",
          usdtRateVnd: 2580000
        }
      ])
    };
    const llmService = {
      clarify: vi.fn(async (): Promise<AskResponse> => ({ mode: "clarification", text: "clarify", sources: [] })),
      answerWithSources: vi.fn(async (): Promise<AskResponse> => ({ mode: "llm_answer", text: "fallback", sources: [] }))
    };

    const service = new AskService(searchService as never, llmService as never);
    const result = await service.handleQuestion("обмен usdt");

    expect(result.mode).toBe("db_answer");
    expect(result.text).toContain("1 USDT = 2580000 VND");
    expect(llmService.answerWithSources).not.toHaveBeenCalled();
  });

  it("filters implausible low usdt rate and asks to уточнить пару", async () => {
    const searchService = {
      search: vi.fn(async (): Promise<SearchResult[]> => [
        {
          messageId: 2,
          chatId: 101,
          date: new Date(),
          text: "Обмен валют",
          adCategory: "currency_exchange",
          score: 0.9,
          link: "https://t.me/c/101/2",
          usdtRateVnd: 3
        }
      ])
    };
    const llmService = {
      clarify: vi.fn(async (): Promise<AskResponse> => ({ mode: "clarification", text: "clarify", sources: [] })),
      answerWithSources: vi.fn(async (): Promise<AskResponse> => ({ mode: "llm_answer", text: "fallback", sources: [] }))
    };

    const service = new AskService(searchService as never, llmService as never);
    const result = await service.handleQuestion("обмен usdt");

    expect(result.mode).toBe("clarification");
    expect(result.sources).toHaveLength(0);
    expect(llmService.answerWithSources).not.toHaveBeenCalled();
  });
});
