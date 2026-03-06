import type { Filter } from "mongodb";
import type { CurrencyPair, MessageDoc, ParsedQuery } from "../../types/domain.js";

const ACTIVE_STATUSES = ["active", "edited"] as const;

export type BuildSearchFilterInput = {
  parsed: ParsedQuery;
  allowedChatIds?: number[];
  dateFrom: Date;
  dateTo: Date;
  textSearch: string;
};

function currencyPairPath(pair: CurrencyPair): string {
  return `extracted_currency.${pair}`;
}

export function buildSearchFilter(input: BuildSearchFilterInput): Filter<MessageDoc> {
  const { parsed, allowedChatIds, dateFrom, dateTo, textSearch } = input;
  const filter: Filter<MessageDoc> = {
    status: { $in: [...ACTIVE_STATUSES] },
    date: { $gte: dateFrom, $lte: dateTo }
  };
  if (allowedChatIds && allowedChatIds.length > 0) {
    filter.chat_id = { $in: allowedChatIds };
  }

  if (parsed.categories?.length) {
    filter.ad_category = { $in: parsed.categories };
  }
  if (parsed.hasMedia !== undefined) {
    filter.has_media = parsed.hasMedia;
  }
  if (parsed.isQa !== undefined) {
    filter.is_qa = parsed.isQa;
  }
  if (textSearch) {
    filter.$text = { $search: textSearch };
  }
  if (parsed.currencyPairs?.length) {
    filter.$and = parsed.currencyPairs.map((pair) => ({
      [currencyPairPath(pair)]: { $ne: null }
    }));
  }
  const isBikeQuery = parsed.categories?.includes("bike_rent") ?? false;
  const isRealEstateQuery = parsed.categories?.includes("real_estate_rent") ?? false;
  if (isBikeQuery) {
    // Bike search relies only on structured DB fields from extracted_bike.
    filter["extracted_bike.is_bike_ad"] = true;
    if (parsed.bikeFilters?.dealType) {
      filter["extracted_bike.deal_type"] = parsed.bikeFilters.dealType;
    }
    if (parsed.bikeFilters?.brand) {
      filter["extracted_bike.bike_brand"] = { $regex: `^${parsed.bikeFilters.brand}$`, $options: "i" };
    }
    if (parsed.bikeFilters?.model) {
      filter["extracted_bike.bike_model"] = { $regex: parsed.bikeFilters.model, $options: "i" };
    }
    if (parsed.bikeFilters?.engineCc !== undefined) {
      filter["extracted_bike.engine_cc"] = parsed.bikeFilters.engineCc;
    }
    if (parsed.bikeFilters?.period) {
      filter["extracted_bike.price_primary.period"] = parsed.bikeFilters.period;
    }
    if (parsed.bikeFilters?.location) {
      filter.$or = [
        { "extracted_bike.location.normalized": parsed.bikeFilters.location },
        { "extracted_bike.location.district": parsed.bikeFilters.location }
      ];
    }
  }

  if (parsed.priceRange?.min !== undefined || parsed.priceRange?.max !== undefined) {
    const pricePath = isBikeQuery && !isRealEstateQuery ? "extracted_bike.price_primary.amount" : "extracted_real_estate.price_primary.amount";
    filter[pricePath] = {};
    if (parsed.priceRange.min !== undefined) {
      filter[pricePath].$gte = parsed.priceRange.min;
    }
    if (parsed.priceRange.max !== undefined) {
      filter[pricePath].$lte = parsed.priceRange.max;
    }
  }

  return filter;
}
