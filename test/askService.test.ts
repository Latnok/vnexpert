import { describe, expect, it, vi } from "vitest";
import { AskService } from "../src/modules/ask/askService.js";
import type { AskResponse, SearchResult } from "../src/types/domain.js";

describe("AskService", () => {
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
