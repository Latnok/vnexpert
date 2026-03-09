import { DateTime } from "luxon";
import type { MessagesRepository } from "../../db/repositories/messagesRepository.js";
import { config } from "../../config.js";
import type { ParsedQuery, SearchResult } from "../../types/domain.js";

const CURRENCY_FALLBACK_LOOKBACK_DAYS = 3;

function locationRankForMarker(item: SearchResult, marker: NonNullable<ParsedQuery["locationMarker"]>): number {
  const location = item.realEstate?.location;
  const districtRaw =
    location && typeof location === "object" && typeof (location as Record<string, unknown>).district === "string"
      ? String((location as Record<string, unknown>).district)
      : undefined;
  const normalizedRaw =
    location && typeof location === "object" && typeof (location as Record<string, unknown>).normalized === "string"
      ? String((location as Record<string, unknown>).normalized)
      : undefined;
  const value = `${districtRaw ?? ""} ${normalizedRaw ?? ""}`.toLowerCase().trim();

  if (!value) {
    return 1;
  }
  if (value.includes(marker)) {
    return 0;
  }
  return 2;
}

export function prioritizeByLocationMarker(results: SearchResult[], parsed: ParsedQuery): SearchResult[] {
  const marker = parsed.locationMarker;
  if (!marker) {
    return results;
  }
  if (!(parsed.categories?.includes("real_estate_rent") ?? false)) {
    return results;
  }

  const decorated = results.map((item, index) => ({
    item,
    index,
    rank: locationRankForMarker(item, marker)
  }));
  decorated.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return decorated.map((entry) => entry.item);
}

function isSuspiciousRealEstatePrice(item: SearchResult): boolean {
  if (item.adCategory !== "real_estate_rent" || !item.realEstate || typeof item.realEstate !== "object") {
    return false;
  }
  const src = item.realEstate as Record<string, unknown>;
  const price = src.price_primary && typeof src.price_primary === "object" ? (src.price_primary as Record<string, unknown>) : undefined;
  const expenses =
    src.other_expenses && typeof src.other_expenses === "object" ? (src.other_expenses as Record<string, unknown>) : undefined;
  const amount = typeof price?.amount === "number" ? price.amount : undefined;
  const periodRaw = typeof price?.period === "string" ? price.period.toLowerCase() : "";
  const management = typeof expenses?.management_fee_vnd_per_person === "number" ? expenses.management_fee_vnd_per_person : undefined;
  if (amount === undefined) {
    return false;
  }
  const isMonthly = periodRaw.includes("month") || periodRaw.includes("мес");
  if (!isMonthly) {
    return false;
  }
  if (management !== undefined && management === amount) {
    return true;
  }
  return amount <= 1_000_000;
}

function filterSuspiciousRealEstatePrices(results: SearchResult[], parsed: ParsedQuery): SearchResult[] {
  if (!(parsed.categories?.includes("real_estate_rent") ?? false)) {
    return results;
  }
  return results.filter((item) => !isSuspiciousRealEstatePrice(item));
}

export class SearchService {
  constructor(private readonly messagesRepository: MessagesRepository) {}

  async search(parsed: ParsedQuery): Promise<SearchResult[]> {
    const now = DateTime.now();
    const defaultFrom = now.minus({ days: config.askDefaultLookbackDays }).toJSDate();
    const qaDefaultFrom = DateTime.fromMillis(0).toJSDate();
    let dateFrom = parsed.dateFrom ?? (parsed.isQa ? qaDefaultFrom : defaultFrom);
    let dateTo = parsed.dateTo ?? now.toJSDate();

    const isCurrencyQuery =
      (parsed.currencyPairs?.length ?? 0) > 0 || (parsed.categories?.includes("currency_exchange") ?? false);
    if (isCurrencyQuery && !parsed.isQa) {
      dateFrom = now.minus({ hours: 24 }).toJSDate();
      dateTo = now.toJSDate();
    }

    let results = await this.searchWithinChatScope(parsed, undefined, dateFrom, dateTo, isCurrencyQuery);

    // For currency lookups we first use strict 24h window, then widen to default lookback
    // if user did not explicitly set a date and nothing was found.
    if (
      isCurrencyQuery &&
      results.length === 0 &&
      !parsed.isQa &&
      parsed.dateFrom === undefined &&
      parsed.dateTo === undefined
    ) {
      const widenedFrom = now.minus({ days: CURRENCY_FALLBACK_LOOKBACK_DAYS }).toJSDate();
      results = await this.searchWithinChatScope(parsed, undefined, widenedFrom, now.toJSDate(), isCurrencyQuery);
    }

    const cleaned = filterSuspiciousRealEstatePrices(results, parsed);
    return prioritizeByLocationMarker(cleaned, parsed);
  }

  private async searchWithinChatScope(
    parsed: ParsedQuery,
    chatIds: number[] | undefined,
    dateFrom: Date,
    dateTo: Date,
    isCurrencyQuery: boolean
  ): Promise<SearchResult[]> {
    const isBikeQuery = parsed.categories?.includes("bike_rent") ?? false;
    const primary = await this.messagesRepository.searchMessages({
      parsed,
      allowedChatIds: chatIds,
      dateFrom,
      dateTo,
      limit: 20
    });
    if (primary.length > 0) {
      return primary;
    }

    if (isBikeQuery) {
      let relaxedBikeParsed: ParsedQuery = parsed;
      if (parsed.keywords.length > 0) {
        relaxedBikeParsed = {
          ...parsed,
          keywords: []
        };
        const relaxedByText = await this.messagesRepository.searchMessages({
          parsed: relaxedBikeParsed,
          allowedChatIds: chatIds,
          dateFrom,
          dateTo,
          limit: 20
        });
        if (relaxedByText.length > 0) {
          return relaxedByText;
        }
      }

      if (relaxedBikeParsed.bikeFilters?.period) {
        const bikeFiltersWithoutPeriod = { ...relaxedBikeParsed.bikeFilters };
        delete bikeFiltersWithoutPeriod.period;
        const relaxedWithoutPeriod: ParsedQuery = {
          ...relaxedBikeParsed,
          bikeFilters: bikeFiltersWithoutPeriod
        };
        const relaxedByPeriod = await this.messagesRepository.searchMessages({
          parsed: relaxedWithoutPeriod,
          allowedChatIds: chatIds,
          dateFrom,
          dateTo,
          limit: 20
        });
        if (relaxedByPeriod.length > 0) {
          return relaxedByPeriod;
        }
        relaxedBikeParsed = relaxedWithoutPeriod;
      }

      if (relaxedBikeParsed.bikeFilters?.dealType) {
        const bikeFiltersWithoutDealType = { ...relaxedBikeParsed.bikeFilters };
        delete bikeFiltersWithoutDealType.dealType;
        const relaxedWithoutDealType: ParsedQuery = {
          ...relaxedBikeParsed,
          bikeFilters: bikeFiltersWithoutDealType
        };
        const relaxedByDealType = await this.messagesRepository.searchMessages({
          parsed: relaxedWithoutDealType,
          allowedChatIds: chatIds,
          dateFrom,
          dateTo,
          limit: 20
        });
        if (relaxedByDealType.length > 0) {
          return relaxedByDealType;
        }
      }
    }

    // Currency queries are often sparse in wording ("курс рубля"),
    // so fallback to structured filters without hard full-text constraint.
    if (isCurrencyQuery && parsed.keywords.length > 0) {
      const relaxedParsed: ParsedQuery = {
        ...parsed,
        keywords: [],
        categories: parsed.categories?.length ? parsed.categories : ["currency_exchange"]
      };
      const relaxed = await this.messagesRepository.searchMessages({
        parsed: relaxedParsed,
        allowedChatIds: chatIds,
        dateFrom,
        dateTo,
        limit: 20
      });
      if (relaxed.length > 0) {
        return relaxed;
      }

      // Final recall pass: keep currency category/date filters, but do not require extracted pair fields.
      const recallParsed: ParsedQuery = {
        ...relaxedParsed,
        currencyPairs: undefined
      };
      return this.messagesRepository.searchMessages({
        parsed: recallParsed,
        allowedChatIds: chatIds,
        dateFrom,
        dateTo,
        limit: 20
      });
    }

    return primary;
  }
}
