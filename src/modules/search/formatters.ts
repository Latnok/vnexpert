import { DateTime } from "luxon";
import type { CurrencyPair } from "../../types/domain.js";
import type { AskResponse, SearchResult } from "../../types/domain.js";
import type { OfficialVndRates } from "../currency/officialRateService.js";

const CURRENCY_TIPS = [
  "Чтобы быстро перевести в рубли ценник надо VND поделить на 1000 и умножить на 3",
  "Никогда не переводите деньги заранее, никаких авансов",
  "Снять наличные VND с карты МИР можно в банкомате VRB"
] as const;

function stripEmojis(value: string): string {
  return value
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Regional_Indicator}\uFE0F\u200D]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function getStringValue(source: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!source) {
    return undefined;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return stripEmojis(value);
    }
  }
  return undefined;
}

function getPriceValue(source: Record<string, unknown> | undefined): string | undefined {
  if (!source) {
    return undefined;
  }
  const pricePrimary = source.price_primary;
  if (!pricePrimary || typeof pricePrimary !== "object") {
    return undefined;
  }
  const obj = pricePrimary as Record<string, unknown>;
  const amount = typeof obj.amount === "number" ? obj.amount : undefined;
  const currency = typeof obj.currency === "string" ? obj.currency : "";
  const period = typeof obj.period === "string" ? obj.period : "";
  if (typeof amount === "number" && Number.isFinite(amount)) {
    const formattedAmount = new Intl.NumberFormat("ru-RU").format(amount);
    const parts = [formattedAmount, currency, period].filter(Boolean);
    return stripEmojis(parts.join(" "));
  }
  return undefined;
}

function getOtherExpensesValue(source: Record<string, unknown> | undefined): string | undefined {
  if (!source) {
    return undefined;
  }
  const expenses = asRecord(source.other_expenses);
  if (!expenses) {
    return undefined;
  }
  const electricity = typeof expenses.electricity_vnd_per_kwh === "number" ? expenses.electricity_vnd_per_kwh : undefined;
  const water =
    typeof expenses.water_vnd_per_person_month === "number" ? expenses.water_vnd_per_person_month : undefined;
  const management =
    typeof expenses.management_fee_vnd_per_person === "number" ? expenses.management_fee_vnd_per_person : undefined;

  const parts: string[] = [];
  if (typeof electricity === "number") {
    parts.push(`электричество ${new Intl.NumberFormat("ru-RU").format(electricity)} VND/кВтч`);
  }
  if (typeof water === "number") {
    parts.push(`вода ${new Intl.NumberFormat("ru-RU").format(water)} VND/чел/мес`);
  }
  if (typeof management === "number") {
    parts.push(`управление ${new Intl.NumberFormat("ru-RU").format(management)} VND/чел`);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("; ");
}

function getContractValue(source: Record<string, unknown> | undefined): string | undefined {
  if (!source) {
    return undefined;
  }
  const contractTerm = asRecord(source.contract_term);
  if (!contractTerm) {
    return undefined;
  }
  const min = typeof contractTerm.min_months === "number" ? contractTerm.min_months : undefined;
  const max = typeof contractTerm.max_months === "number" ? contractTerm.max_months : undefined;
  if (typeof min === "number" && typeof max === "number") {
    return `${min}-${max} месяцев`;
  }
  if (typeof min === "number") {
    return `от ${min} месяцев`;
  }
  if (typeof max === "number") {
    return `до ${max} месяцев`;
  }
  return undefined;
}

function getLocation(source: Record<string, unknown> | undefined): { district?: string; complex?: string } {
  const location = asRecord(source?.location);
  if (!location) {
    return {
      district: getStringValue(source, ["district", "area", "region"]),
      complex: getStringValue(source, ["residential_complex", "complex", "condo", "project"])
    };
  }

  const districtRaw = location.district;
  const normalizedRaw = location.normalized;
  const complexRaw = location.complex;

  const district =
    (typeof districtRaw === "string" && districtRaw.trim() ? stripEmojis(districtRaw) : undefined) ??
    (typeof normalizedRaw === "string" && normalizedRaw.trim() ? stripEmojis(normalizedRaw) : undefined);
  const complex = typeof complexRaw === "string" && complexRaw.trim() ? stripEmojis(complexRaw) : undefined;
  return { district, complex };
}

function buildRealEstateLine(item: SearchResult): string {
  const extracted = item.realEstate;
  const location = getLocation(extracted);
  const district = location.district;
  const complex = location.complex;
  const price = getPriceValue(extracted);
  const extraCosts = getOtherExpensesValue(extracted);
  const contract = getContractValue(extracted);
  const date = DateTime.fromJSDate(item.date).toFormat("dd.LL HH:mm");
  const link = item.link ? `\n  ${item.link}` : "";
  const lines: string[] = [];

  if (district) {
    lines.push(`📍 Район: ${district}`);
  }
  if (complex) {
    lines.push(`🏢 ЖК: ${complex}`);
  }
  if (price) {
    lines.push(`💰 Цена: ${price}`);
  }
  if (extraCosts) {
    lines.push(`⚙️ Доп.расходы: ${extraCosts}`);
  }
  if (contract) {
    lines.push(`📄 Контракт: ${contract}`);
  }

  lines.push(`📅 Дата публикации: ${date}${link}`);
  lines.push("────────────────────────");

  return lines.join("\n");
}

function buildGenericLine(item: SearchResult): string {
  const preview = stripEmojis(item.text.slice(0, 180));
  const date = DateTime.fromJSDate(item.date).toFormat("dd.LL HH:mm");
  const link = item.link ? `\n  ${item.link}` : "";
  const lines = [`📝 ${preview}`, `📅 Дата публикации: ${date}${link}`, "────────────────────────"];
  return lines.join("\n");
}

export function buildDbAnswer(
  query: string,
  results: SearchResult[],
  page?: { offset?: number; limit?: number }
): AskResponse {
  const offset = page?.offset ?? 0;
  const limit = page?.limit ?? 5;
  const top = results.slice(offset, offset + limit);
  const hasMore = offset + top.length < results.length;
  const lines = top.map((item) => {
    if (item.adCategory === "real_estate_rent") {
      return buildRealEstateLine(item);
    }
    return buildGenericLine(item);
  });
  const pageSuffix = offset > 0 ? ` (с ${offset + 1})` : "";
  const footer = hasMore
    ? `Всего найдено ${results.length} объявлений, чтобы листать дальше напиши еще`
    : `Всего найдено ${results.length} объявлений.`;
  return {
    mode: "db_answer",
    text: `Результаты по запросу "${query}"${pageSuffix}:\n\n${lines.join("\n\n")}\n\n${footer}`,
    sources: top.map((item) => ({ chatId: item.chatId, messageId: item.messageId, link: item.link }))
  };
}

export function buildClarification(text: string): AskResponse {
  return {
    mode: "clarification",
    text,
    sources: []
  };
}

function pairLabel(pair: CurrencyPair): string {
  if (pair === "vnd_rub") {
    return "RUB";
  }
  if (pair === "vnd_usd") {
    return "USD";
  }
  return "USDT";
}

function pairRate(item: SearchResult, pair: CurrencyPair): number | undefined {
  if (pair === "vnd_rub") {
    return item.rubRateVnd;
  }
  if (pair === "vnd_usd") {
    return item.usdRateVnd;
  }
  return item.usdtRateVnd;
}

function isPlausibleRate(pair: CurrencyPair, rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0) {
    return false;
  }
  if (pair === "vnd_rub") {
    return rate >= 100;
  }
  return rate >= 10000;
}

export function buildCurrencyAnswer(
  results: SearchResult[],
  requestedPairs?: CurrencyPair[],
  officialRates?: OfficialVndRates | null
): AskResponse {
  const pairs: CurrencyPair[] = requestedPairs?.length ? requestedPairs : ["vnd_rub", "vnd_usd", "vnd_usdt"];
  const offers: Array<{ pair: CurrencyPair; rate: number; date: Date; link?: string; chatId: number; messageId: number }> = [];
  const sources: Array<{ chatId: number; messageId: number; link?: string }> = [];

  for (const pair of pairs) {
    for (const item of results) {
      const rate = pairRate(item, pair);
      if (typeof rate !== "number" || !isPlausibleRate(pair, rate)) {
        continue;
      }
      offers.push({
        pair,
        rate,
        date: item.date,
        link: item.link,
        chatId: item.chatId,
        messageId: item.messageId
      });
      sources.push({ chatId: item.chatId, messageId: item.messageId, link: item.link });
    }
  }

  if (offers.length === 0) {
    return {
      mode: "clarification",
      text: "Не удалось извлечь запрошенный курс из найденных сообщений. Уточните пару обмена.",
      sources: []
    };
  }

  const officialLines: string[] = [];
  if (officialRates) {
    officialLines.push(`Оф. курс ЦБ РФ (${officialRates.date}):`);
    for (const pair of pairs) {
      const rate = officialRates.rates[pair];
      if (typeof rate === "number" && Number.isFinite(rate)) {
        officialLines.push(`1 ${pairLabel(pair)} = ${Math.round(rate * 1000) / 1000} VND`);
      }
    }
  }

  const parts: string[] = [];
  if (officialLines.length > 1) {
    parts.push(officialLines.join("\n"));
  }
  offers.sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime();
    if (byDate !== 0) {
      return byDate;
    }
    return a.rate - b.rate;
  });
  const offerLines = offers.slice(0, 5).map((offer) => {
    const date = DateTime.fromJSDate(offer.date).toFormat("dd.LL HH:mm");
    const roundedRate = Math.round(offer.rate * 1000) / 1000;
    const link = offer.link ?? "";
    return `1 ${pairLabel(offer.pair)} = ${roundedRate} VND (${date})${link ? `\n${link}` : ""}`;
  });
  parts.push("Предложения обмена:");
  parts.push(offerLines.join("\n\n"));
  const randomTip = CURRENCY_TIPS[Math.floor(Math.random() * CURRENCY_TIPS.length)];
  parts.push("────────────────────────");
  parts.push(`${randomTip}`);

  return {
    mode: "db_answer",
    text: `Курс обмена:\n\n${parts.join("\n\n")}`,
    sources: sources.slice(0, 5)
  };
}
