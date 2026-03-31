import { describe, expect, it, vi } from "vitest";
import { AskService } from "../src/modules/ask/askService.js";
import type { AskResponse, SearchResult } from "../src/types/domain.js";

describe("AskService food query threshold", () => {
  it("returns db_answer for a single food result without forcing clarification", async () => {
    const searchService = {
      search: vi.fn(async (): Promise<SearchResult[]> => [
        {
          messageId: 11,
          chatId: 100,
          date: new Date(),
          text: "Кафе с завтраками у моря",
          adCategory: "food_place",
          score: 0.9,
          link: "https://t.me/c/100/11"
        }
      ])
    };
    const llmService = {
      clarify: vi.fn(async (): Promise<AskResponse> => ({ mode: "clarification", text: "clarify", sources: [] })),
      answerWithSources: vi.fn(async (): Promise<AskResponse> => ({ mode: "llm_answer", text: "fallback", sources: [] }))
    };

    const service = new AskService(searchService as never, llmService as never);
    const result = await service.handleQuestion("Где поесть");

    expect(result.mode).toBe("db_answer");
    expect(result.text).toContain("Результаты по запросу");
    expect(llmService.answerWithSources).not.toHaveBeenCalled();
  });
});
