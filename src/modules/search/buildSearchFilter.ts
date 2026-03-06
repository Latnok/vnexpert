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
  const isFoodQuery = parsed.categories?.includes("food_place") ?? false;
  const isVisaranQuery = parsed.categories?.includes("visaran") ?? false;
  const isJobQuery = parsed.categories?.includes("job_vacancy") ?? false;
  const isCityEventQuery = parsed.categories?.includes("city_event") ?? false;
  const isCasinoQuery = parsed.categories?.includes("casino_poker") ?? false;
  const isExcursionsQuery = parsed.categories?.includes("excursions") ?? false;
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
  if (isFoodQuery) {
    if (parsed.foodFilters?.area) {
      filter["extracted_food.location.area.normalized"] = parsed.foodFilters.area;
    }
    if (parsed.foodFilters?.primaryCuisine) {
      filter["extracted_food.primary_cuisine"] = parsed.foodFilters.primaryCuisine;
    }
    if (parsed.foodFilters?.cuisineTag) {
      filter["extracted_food.cuisine_tags"] = parsed.foodFilters.cuisineTag;
    }
  }
  if (isVisaranQuery) {
    if (parsed.visaranFilters?.direction) {
      filter["extracted_visaran.direction_primary"] = parsed.visaranFilters.direction;
    }
  }
  if (isJobQuery) {
    if (parsed.jobFilters?.workFormat) {
      filter["extracted_job.work_format"] = parsed.jobFilters.workFormat;
    }
    if (parsed.jobFilters?.employmentType) {
      filter["extracted_job.employment_type"] = parsed.jobFilters.employmentType;
    }
  }
  if (isCityEventQuery && parsed.cityEventFilters?.ticketRequired !== undefined) {
    filter["extracted_city_event.ticket_required"] = parsed.cityEventFilters.ticketRequired;
  }
  if (isCasinoQuery) {
    if (parsed.casinoFilters?.gameType) {
      filter["extracted_casino_poker.game_type"] = parsed.casinoFilters.gameType;
    }
    if (parsed.casinoFilters?.pokerFormat) {
      filter["extracted_casino_poker.poker_format"] = parsed.casinoFilters.pokerFormat;
    }
  }
  if (isExcursionsQuery && parsed.excursionFilters?.tourType) {
    filter["extracted_excursions.tour_type"] = parsed.excursionFilters.tourType;
  }

  if (parsed.priceRange?.min !== undefined || parsed.priceRange?.max !== undefined) {
    let pricePath = "extracted_real_estate.price_primary.amount";
    if (isBikeQuery && !isRealEstateQuery) {
      pricePath = "extracted_bike.price_primary.amount";
    } else if (isVisaranQuery) {
      pricePath = "extracted_visaran.price_primary.amount";
    } else if (isJobQuery) {
      pricePath = "extracted_job.salary_primary.amount";
    } else if (isCityEventQuery) {
      pricePath = "extracted_city_event.price_primary.amount";
    } else if (isCasinoQuery) {
      pricePath = "extracted_casino_poker.buy_in_primary.amount";
    } else if (isExcursionsQuery) {
      pricePath = "extracted_excursions.price_primary.amount";
    }
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
