import "dotenv/config";

type Config = {
  botToken: string;
  mongodbUri: string;
  openAiApiKey?: string;
  openAiModel: string;
  logLevel: string;
  defaultTimezone: string;
  askDefaultLookbackDays: number;
  llmFallbackEnabled: boolean;
  llmFallbackOnParseFail: boolean;
  llmFallbackOnLowResults: boolean;
  llmFallbackMinRelevantResults: number;
};

function getNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config: Config = {
  botToken: process.env.BOT_TOKEN ?? "",
  mongodbUri: process.env.MONGODB_URI ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  logLevel: process.env.LOG_LEVEL ?? "info",
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "Asia/Bangkok",
  askDefaultLookbackDays: getNumber("ASK_DEFAULT_LOOKBACK_DAYS", 7),
  llmFallbackEnabled: (process.env.LLM_FALLBACK_ENABLED ?? "true") === "true",
  llmFallbackOnParseFail: (process.env.LLM_FALLBACK_ON_PARSE_FAIL ?? "true") === "true",
  llmFallbackOnLowResults: (process.env.LLM_FALLBACK_ON_LOW_RESULTS ?? "true") === "true",
  llmFallbackMinRelevantResults: getNumber("LLM_FALLBACK_MIN_RELEVANT_RESULTS", 2)
};

export function assertRequiredConfig(): void {
  if (!config.botToken) {
    throw new Error("BOT_TOKEN is required");
  }
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI is required");
  }
}
