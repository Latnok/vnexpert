import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { parseQuery } from "../search/queryParser.js";
import { buildClarification, buildCurrencyAnswer, buildDbAnswer } from "../search/formatters.js";
import type { AskResponse } from "../../types/domain.js";
import type { SearchService } from "../search/searchService.js";
import type { OpenAiFallbackService } from "../llm/openAiFallbackService.js";
import { NoopFallbackEventTracker, type FallbackEventTracker } from "./fallbackEventTracker.js";
import { NoopOfficialRateService, type OfficialRateService } from "../currency/officialRateService.js";

export class AskService {
  constructor(
    private readonly searchService: SearchService,
    private readonly llmFallbackService: OpenAiFallbackService,
    private readonly fallbackEventTracker: FallbackEventTracker = new NoopFallbackEventTracker(),
    private readonly officialRateService: OfficialRateService = new NoopOfficialRateService()
  ) {}

  async handleQuestion(question: string, page?: { offset?: number; limit?: number }): Promise<AskResponse> {
    const parsed = parseQuery(question);
    if (parsed.needsClarification) {
      if (!config.llmFallbackEnabled || !config.llmFallbackOnParseFail) {
        return buildClarification(parsed.clarificationPrompt ?? "Уточните параметры запроса.");
      }
      const clarify = await this.llmFallbackService.clarify(question, parsed.clarificationPrompt);
      await this.trackFallbackEvent({
        question,
        reason: "parse_fail_or_needs_clarification",
        candidatesCount: 0,
        parsedKeywordsCount: parsed.keywords.length,
        parsedCategories: parsed.categories,
        responseMode: clarify.mode === "llm_answer" ? "llm_answer" : "clarification",
        llmEnabled: config.llmFallbackEnabled
      });
      return clarify.mode === "clarification" ? clarify : buildClarification(clarify.text);
    }

    const results = await this.searchService.search(parsed);
    const isCurrencyQuery =
      (parsed.currencyPairs?.length ?? 0) > 0 || (parsed.categories?.includes("currency_exchange") ?? false);
    const minRelevant = isCurrencyQuery ? 1 : config.llmFallbackMinRelevantResults;
    if (results.length >= minRelevant) {
      if (isCurrencyQuery) {
        const officialRates = await this.officialRateService.getOfficialVndRates(parsed.currencyPairs);
        return buildCurrencyAnswer(results, parsed.currencyPairs, officialRates);
      }
      return buildDbAnswer(question, results, page);
    }

    if (!config.llmFallbackEnabled || !config.llmFallbackOnLowResults) {
      return buildClarification("Найдено мало релевантных объявлений. Уточните категорию, период или ключевые слова.");
    }
    const llmResponse = await this.llmFallbackService.answerWithSources(question, results);
    await this.trackFallbackEvent({
      question,
      reason: "low_results",
      candidatesCount: results.length,
      parsedKeywordsCount: parsed.keywords.length,
      parsedCategories: parsed.categories,
      responseMode: llmResponse.mode === "clarification" ? "clarification" : "llm_answer",
      llmEnabled: config.llmFallbackEnabled
    });
    return llmResponse;
  }

  private async trackFallbackEvent(event: {
    question: string;
    reason: "parse_fail_or_needs_clarification" | "low_results";
    candidatesCount: number;
    parsedKeywordsCount: number;
    parsedCategories?: string[];
    responseMode: "clarification" | "llm_answer";
    llmEnabled: boolean;
  }): Promise<void> {
    try {
      await this.fallbackEventTracker.track(event);
    } catch (error) {
      logger.error({ error }, "Failed to persist fallback event");
    }
  }
}
