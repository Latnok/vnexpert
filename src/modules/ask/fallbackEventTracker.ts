export type FallbackEventInput = {
  question: string;
  reason: "parse_fail_or_needs_clarification" | "low_results";
  candidatesCount: number;
  parsedKeywordsCount: number;
  parsedCategories?: string[];
  responseMode: "clarification" | "llm_answer";
  llmEnabled: boolean;
};

export interface FallbackEventTracker {
  track(event: FallbackEventInput): Promise<void>;
}

export class NoopFallbackEventTracker implements FallbackEventTracker {
  async track(_event: FallbackEventInput): Promise<void> {
    return;
  }
}

