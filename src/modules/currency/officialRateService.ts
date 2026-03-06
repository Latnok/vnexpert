import type { CurrencyPair } from "../../types/domain.js";
import { logger } from "../../lib/logger.js";
import type { OfficialRatesRepository } from "../../db/repositories/officialRatesRepository.js";

export type OfficialVndRates = {
  source: "cbr";
  date: string;
  rates: Partial<Record<CurrencyPair, number>>;
};

export interface OfficialRateService {
  getOfficialVndRates(requestedPairs?: CurrencyPair[]): Promise<OfficialVndRates | null>;
}

export class NoopOfficialRateService implements OfficialRateService {
  async getOfficialVndRates(): Promise<OfficialVndRates | null> {
    return null;
  }
}

function parseDecimal(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractVunitRate(xml: string, code: string): number | null {
  const blocks = xml.match(/<Valute[^>]*>[\s\S]*?<\/Valute>/gi) ?? [];
  for (const block of blocks) {
    const charCode = extractTag(block, "CharCode");
    if (!charCode || charCode.toUpperCase() !== code.toUpperCase()) {
      continue;
    }
    const vunitRate = extractTag(block, "VunitRate");
    if (!vunitRate) {
      return null;
    }
    return parseDecimal(vunitRate);
  }
  return null;
}

export class CbrOfficialRateService implements OfficialRateService {
  private readonly endpoint = "https://www.cbr.ru/scripts/XML_daily.asp";
  constructor(private readonly repository?: OfficialRatesRepository) {}

  async getOfficialVndRates(requestedPairs?: CurrencyPair[]): Promise<OfficialVndRates | null> {
    const pairs: CurrencyPair[] = requestedPairs?.length ? requestedPairs : ["vnd_rub", "vnd_usd", "vnd_usdt"];
    if (!pairs.some((pair) => pair === "vnd_rub" || pair === "vnd_usd")) {
      return null;
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    const cached = await this.repository?.getForDay("cbr", todayKey);
    if (cached) {
      return {
        source: "cbr",
        date: cached.cbr_date || todayKey,
        rates: this.pickRequestedRates(cached.rates, pairs)
      };
    }

    try {
      const response = await fetch(this.endpoint);
      if (!response.ok) {
        return null;
      }
      const xml = await response.text();
      const dateMatch = xml.match(/<ValCurs[^>]*Date="([0-9.]+)"/i);
      const date = dateMatch?.[1] ?? "";

      const rubPerVnd = extractVunitRate(xml, "VND");
      if (!rubPerVnd || rubPerVnd <= 0) {
        return null;
      }

      const rates: Partial<Record<CurrencyPair, number>> = {};
      if (pairs.includes("vnd_rub")) {
        rates.vnd_rub = 1 / rubPerVnd;
      }
      if (pairs.includes("vnd_usd")) {
        const rubPerUsd = extractVunitRate(xml, "USD");
        if (rubPerUsd && rubPerUsd > 0) {
          rates.vnd_usd = rubPerUsd / rubPerVnd;
        }
      }
      await this.repository?.upsertForDay({
        source: "cbr",
        requestedDate: todayKey,
        cbrDate: date || "дата не указана",
        rates
      });

      return {
        source: "cbr",
        date: date || "дата не указана",
        rates: this.pickRequestedRates(rates, pairs)
      };
    } catch (error) {
      logger.warn({ error }, "Failed to fetch official rates from CBR");
      return null;
    }
  }

  private pickRequestedRates(
    rates: Partial<Record<CurrencyPair, number>>,
    pairs: CurrencyPair[]
  ): Partial<Record<CurrencyPair, number>> {
    const picked: Partial<Record<CurrencyPair, number>> = {};
    for (const pair of pairs) {
      const value = rates[pair];
      if (typeof value === "number" && Number.isFinite(value)) {
        picked[pair] = value;
      }
    }
    return picked;
  }
}
