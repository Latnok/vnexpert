import type { FallbackEventsRepository } from "../../db/repositories/fallbackEventsRepository.js";
import type { FallbackEventInput, FallbackEventTracker } from "./fallbackEventTracker.js";

export class MongoFallbackEventTracker implements FallbackEventTracker {
  constructor(private readonly repository: FallbackEventsRepository) {}

  async track(event: FallbackEventInput): Promise<void> {
    await this.repository.insert({
      question: event.question,
      reason: event.reason,
      candidates_count: event.candidatesCount,
      parsed_keywords_count: event.parsedKeywordsCount,
      parsed_categories: event.parsedCategories,
      response_mode: event.responseMode,
      llm_enabled: event.llmEnabled
    });
  }
}

