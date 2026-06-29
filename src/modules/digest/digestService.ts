import { DateTime } from "luxon";
import { config } from "../../config.js";
import type { MessagesRepository } from "../../db/repositories/messagesRepository.js";
import {
  DIGEST_CATEGORY_LABELS,
  type AdCategory,
  type CurrencyPair,
  type DigestFilters,
  type SearchResult
} from "../../types/domain.js";
import { logger } from "../../lib/logger.js";
import { NoopOfficialRateService, type OfficialRateService, type OfficialVndRates } from "../currency/officialRateService.js";
import { NoopWeatherService, type TodayWeatherForecast, type WeatherService } from "../weather/weatherService.js";

const DIGEST_LOOKBACK_HOURS = 24;
const DIGEST_LIMIT_PER_CATEGORY = 5;
const PREVIEW_MAX_LEN = 120;
const DIGEST_MAX_MESSAGE_LEN = 3500;

function toCategoryLabel(category: string): string {
  return DIGEST_CATEGORY_LABELS[category as AdCategory] ?? category;
}

function sanitizeDigestText(text: string): string {
  return String(text || "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactPreview(text: string): string {
  const normalized = sanitizeDigestText(text);
  if (normalized.length <= PREVIEW_MAX_LEN) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_MAX_LEN - 3).trimEnd()}...`;
}

function sanitizeLink(link: string | undefined): string {
  return sanitizeDigestText(link ?? "");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function cleanValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const clean = sanitizeDigestText(value);
  return clean || undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nestedRecord(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return asRecord(source?.[key]);
}

function formatMoney(amount: unknown, currency: unknown, period?: unknown): string | undefined {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }
  const parts = [
    formatNumber(amount),
    typeof currency === "string" && currency.trim() ? currency.trim() : "VND",
    typeof period === "string" && period.trim() ? period.trim() : undefined
  ].filter(Boolean);
  return parts.join(" ");
}

function formatPricePrimary(source: Record<string, unknown> | undefined): string | undefined {
  const price = nestedRecord(source, "price_primary");
  return formatMoney(price?.amount, price?.currency, price?.period);
}

function formatLocation(source: Record<string, unknown> | undefined): string | undefined {
  const location = nestedRecord(source, "location");
  return (
    cleanValue(location?.district) ??
    cleanValue(location?.normalized) ??
    cleanValue(location?.raw) ??
    cleanValue(source?.district) ??
    cleanValue(source?.area)
  );
}

function formatComplex(source: Record<string, unknown> | undefined): string | undefined {
  const location = nestedRecord(source, "location");
  return cleanValue(location?.complex) ?? cleanValue(source?.complex) ?? cleanValue(source?.residential_complex);
}

function formatRate(item: SearchResult): string | undefined {
  const rates: string[] = [];
  if (typeof item.rubRateVnd === "number" && Number.isFinite(item.rubRateVnd)) {
    rates.push(`1 RUB = ${formatNumber(item.rubRateVnd, 2)} VND`);
  }
  if (typeof item.usdRateVnd === "number" && Number.isFinite(item.usdRateVnd)) {
    rates.push(`1 USD = ${formatNumber(item.usdRateVnd, 0)} VND`);
  }
  if (typeof item.usdtRateVnd === "number" && Number.isFinite(item.usdtRateVnd)) {
    rates.push(`1 USDT = ${formatNumber(item.usdtRateVnd, 0)} VND`);
  }
  return rates.length ? rates.join("; ") : undefined;
}

function buildStructuredDigestLine(item: SearchResult, idx: number): string {
  const fields: string[] = [];
  if (item.adCategory === "real_estate_rent") {
    const realEstate = item.realEstate;
    const price = formatPricePrimary(realEstate);
    const location = formatLocation(realEstate);
    const complex = formatComplex(realEstate);
    if (price) {
      fields.push(`Цена: ${price}`);
    }
    if (location) {
      fields.push(`Район: ${location}`);
    }
    if (complex) {
      fields.push(`ЖК: ${complex}`);
    }
  } else if (item.adCategory === "bike_rent") {
    const bike = item.bike;
    const price = formatPricePrimary(bike);
    const brand = cleanValue(bike?.bike_brand);
    const model = cleanValue(bike?.bike_model);
    const yearValue = numberValue(bike?.year);
    const mileageValue = numberValue(bike?.mileage_km);
    const engineValue = numberValue(bike?.engine_cc);
    const year = yearValue !== undefined ? String(yearValue) : undefined;
    const mileage = mileageValue !== undefined ? `${formatNumber(mileageValue)} км` : undefined;
    const engine = engineValue !== undefined ? `${engineValue}cc` : undefined;
    if (price) {
      fields.push(`Цена: ${price}`);
    }
    const modelLine = [brand, model, engine, year].filter(Boolean).join(" ");
    if (modelLine) {
      fields.push(`Байк: ${modelLine}`);
    }
    if (mileage) {
      fields.push(`Пробег: ${mileage}`);
    }
  } else if (item.adCategory === "currency_exchange") {
    const rate = formatRate(item);
    if (rate) {
      fields.push(`Курс: ${rate}`);
    }
  }

  const preview = compactPreview(item.text);
  const safeLink = sanitizeLink(item.link);
  const fieldLine = fields.length ? `\n   ${fields.join(" | ")}` : "";
  return `${idx + 1}. ${preview}${fieldLine}${safeLink ? `\n   ${safeLink}` : ""}`;
}

function flushChunk(chunks: string[], lines: string[]): void {
  const text = lines.join("\n").trim();
  if (text) {
    chunks.push(text);
  }
}

function splitDigestMessages(headerLines: string[], sections: string[]): string[] {
  const chunks: string[] = [];
  let currentLines = [...headerLines];

  for (const section of sections) {
    const candidate = [...currentLines, "", section].join("\n");
    if (candidate.length <= DIGEST_MAX_MESSAGE_LEN) {
      currentLines = [...currentLines, "", section];
      continue;
    }

    if (currentLines.length > headerLines.length) {
      flushChunk(chunks, currentLines);
      currentLines = [...headerLines, "", section];
      continue;
    }

    const lines = section.split("\n");
    let nestedLines = [...headerLines];
    for (const line of lines) {
      const nestedCandidate = [...nestedLines, "", line].join("\n");
      if (nestedCandidate.length > DIGEST_MAX_MESSAGE_LEN && nestedLines.length > headerLines.length) {
        flushChunk(chunks, nestedLines);
        nestedLines = [...headerLines, "", line];
      } else {
        nestedLines = [...nestedLines, "", line];
      }
    }
    currentLines = nestedLines;
  }

  flushChunk(chunks, currentLines);
  return chunks;
}

function describeWeatherCode(code: number): string {
  if (code === 0) {
    return "ясно";
  }
  if ([1, 2, 3].includes(code)) {
    return "переменная облачность";
  }
  if ([45, 48].includes(code)) {
    return "туман";
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return "морось";
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "дождь";
  }
  if ([95, 96, 99].includes(code)) {
    return "гроза";
  }
  return "прогноз";
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function buildInfoSection(params: {
  weather: TodayWeatherForecast | null;
  rates: OfficialVndRates | null;
}): string[] {
  const lines: string[] = [];
  if (params.weather) {
    lines.push(
      `Погода: ${describeWeatherCode(params.weather.weatherCode)}, ${formatNumber(params.weather.tempMinC)}-${formatNumber(
        params.weather.tempMaxC
      )} C, дождь до ${formatNumber(params.weather.precipitationProbabilityMax)}%, ветер до ${formatNumber(
        params.weather.windSpeedMaxKmh
      )} км/ч`
    );
  }
  const rubRate = params.rates?.rates.vnd_rub;
  if (typeof rubRate === "number" && Number.isFinite(rubRate)) {
    lines.push(`Курс ЦБ: 1 RUB = ${formatNumber(rubRate, 2)} VND (${params.rates?.date ?? "сегодня"})`);
  }
  return lines;
}

async function safeDigestInfo<T>(promise: Promise<T>, message: string): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    logger.warn({ error }, message);
    return null;
  }
}

export class DigestService {
  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly weatherService: WeatherService = new NoopWeatherService(),
    private readonly officialRateService: OfficialRateService = new NoopOfficialRateService()
  ) {}

  async buildDigest(params: {
    categories: string[];
    filters?: DigestFilters;
    timezone?: string;
    now?: Date;
  }): Promise<{ text: string; messages: string[]; items: SearchResult[]; sectionCount: number; itemCount: number }> {
    const timezone = params.timezone ?? config.defaultTimezone;
    const to = params.now ?? new Date();
    const toLocal = DateTime.fromJSDate(to).setZone(timezone);
    const fromLocal = toLocal.minus({ hours: DIGEST_LOOKBACK_HOURS });
    const from = fromLocal.toJSDate();

    const items = await this.messagesRepository.digestMessages({
      allowedChatIds: undefined,
      categories: params.categories,
      filters: params.filters,
      from,
      to,
      limitPerCategory: DIGEST_LIMIT_PER_CATEGORY
    });
    const [weather, rates] = await Promise.all([
      safeDigestInfo(this.weatherService.getTodayForecast(), "Failed to fetch digest weather"),
      safeDigestInfo(this.officialRateService.getOfficialVndRates(["vnd_rub" as CurrencyPair]), "Failed to fetch digest rates")
    ]);
    const infoLines = buildInfoSection({ weather, rates });

    if (items.length === 0) {
      const emptyText = [...infoLines, "За последние 24 часа по выбранным категориям новых сообщений нет."]
        .filter(Boolean)
        .join("\n");
      return {
        text: emptyText,
        messages: [emptyText],
        items: [],
        sectionCount: 0,
        itemCount: 0
      };
    }

    const groups = new Map<string, SearchResult[]>();
    for (const item of items) {
      const key = item.adCategory;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    const sections: string[] = [];
    let sectionCount = 0;

    for (const category of params.categories) {
      const group = groups.get(category);
      if (!group || group.length === 0) {
        continue;
      }

      sectionCount += 1;
      const lines = group.slice(0, DIGEST_LIMIT_PER_CATEGORY).map((item, idx) => buildStructuredDigestLine(item, idx));

      sections.push(`${toCategoryLabel(category)} (${group.length})\n${lines.join("\n")}`);
    }

    const period = `${fromLocal.toFormat("dd.MM HH:mm")} - ${toLocal.toFormat("dd.MM HH:mm")}`;
    const headerLines = ["Ежедневный обзор за 24 часа", `${period} (${timezone})`, ...infoLines];
    const messages = splitDigestMessages(headerLines, sections);

    return {
      text: messages.join("\n\n"),
      messages,
      items,
      sectionCount,
      itemCount: items.length
    };
  }
}
