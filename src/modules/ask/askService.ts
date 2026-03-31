import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { parseQuery } from "../search/queryParser.js";
import { buildClarification, buildCurrencyAnswer, buildDbAnswer } from "../search/formatters.js";
import type { AskResponse } from "../../types/domain.js";
import type { SearchService } from "../search/searchService.js";
import type { OpenAiFallbackService } from "../llm/openAiFallbackService.js";
import { NoopFallbackEventTracker, type FallbackEventTracker } from "./fallbackEventTracker.js";
import { NoopOfficialRateService, type OfficialRateService } from "../currency/officialRateService.js";
import { NoopWeatherService, type TodayWeatherForecast, type WeatherService } from "../weather/weatherService.js";

function isWeatherQuestion(question: string): boolean {
  return /(погод|прогноз|дожд|температур|weather)/i.test(question);
}

function isBeachCamQuestion(question: string): boolean {
  const normalized = question.toLowerCase();
  return (
    normalized.includes("что на пляже") ||
    normalized.includes("как на пляже") ||
    normalized.includes("что на море") ||
    normalized.includes("как на море")
  );
}

function buildBeachCamsAnswer(): AskResponse {
  return {
    mode: "db_answer",
    text: beachCamLines().join("\n"),
    sources: []
  };
}

function beachCamLines(): string[] {
  return [
    "Камеры по Нячангу (пляжи):",
    "1) https://worldcam.eu/liveview/36427",
    "2) https://www.meteoblue.com/en/weather/webcams/nha-trang_vietnam_1572151",
    "3) https://guideme24.com/products/e665-1",
    "4) https://www.youtube.com/channel/UCgqmMYGNtMkNWmfUDz12j4Q"
  ];
}

function weatherCodeLabel(code: number): string {
  if (code === 0) {
    return "ясно";
  }
  if (code === 1 || code === 2 || code === 3) {
    return "переменная облачность";
  }
  if (code === 45 || code === 48) {
    return "туман";
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return "морось";
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "дождь";
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "снег";
  }
  if ([95, 96, 99].includes(code)) {
    return "гроза";
  }
  return "переменная погода";
}

function buildTodayWeatherAnswer(forecast: TodayWeatherForecast): AskResponse {
  const min = Math.round(forecast.tempMinC);
  const max = Math.round(forecast.tempMaxC);
  const wind = Math.round(forecast.windSpeedMaxKmh);
  return {
    mode: "db_answer",
    text: [
      `☀️ Погода в Нячанге на сегодня (${forecast.date}):`,
      "",
      `Скорее всего ${weatherCodeLabel(forecast.weatherCode)}, ${min}..${max}°C, ветер: до ${wind} км/ч`,
      "",
      ...beachCamLines()
    ].join("\n"),
    sources: []
  };
}

export class AskService {
  constructor(
    private readonly searchService: SearchService,
    private readonly llmFallbackService: OpenAiFallbackService,
    private readonly fallbackEventTracker: FallbackEventTracker = new NoopFallbackEventTracker(),
    private readonly officialRateService: OfficialRateService = new NoopOfficialRateService(),
    private readonly weatherService: WeatherService = new NoopWeatherService()
  ) {}

  async handleQuestion(question: string, page?: { offset?: number; limit?: number }): Promise<AskResponse> {
    if (isBeachCamQuestion(question)) {
      return buildBeachCamsAnswer();
    }

    if (isWeatherQuestion(question)) {
      const forecast = await this.weatherService.getTodayForecast();
      if (!forecast) {
        return buildClarification("Не удалось получить прогноз погоды. Попробуйте позже.");
      }
      return buildTodayWeatherAnswer(forecast);
    }

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
    const isFoodQuery = parsed.categories?.includes("food_place") ?? false;
    const minRelevant = isCurrencyQuery || isFoodQuery ? 1 : config.llmFallbackMinRelevantResults;
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
