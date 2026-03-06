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

    return prioritizeByLocationMarker(results, parsed);
  }

  private async searchWithinChatScope(
    parsed: ParsedQuery,
    chatIds: number[] | undefined,
    dateFrom: Date,
    dateTo: Date,
    isCurrencyQuery: boolean
  ): Promise<SearchResult[]> {
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
