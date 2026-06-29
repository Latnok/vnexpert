export const AD_CATEGORIES = [
  "real_estate_rent",
  "bike_rent",
  "food_place",
  "job_vacancy",
  "city_event",
  "currency_exchange",
  "casino_poker",
  "visaran",
  "excursions",
  "other_services",
  "ignored",
  "other"
] as const;

export type AdCategory = (typeof AD_CATEGORIES)[number];
export const DIGEST_DEFAULT_CATEGORIES = AD_CATEGORIES.filter((cat) => cat !== "ignored");
export const DIGEST_CATEGORY_LABELS: Record<AdCategory, string> = {
  real_estate_rent: "Жилье",
  bike_rent: "Байки",
  food_place: "Еда",
  job_vacancy: "Работа",
  city_event: "События",
  currency_exchange: "Обмен",
  casino_poker: "Покер и казино",
  visaran: "Визаран",
  excursions: "Экскурсии",
  other_services: "Услуги",
  ignored: "Игнор",
  other: "Другое"
};

export type CurrencyPair = "vnd_rub" | "vnd_usd" | "vnd_usdt";
export type LocationMarker = "north" | "south" | "east" | "west" | "center" | "southwest";
export type BikeDealType = "rent" | "sale" | "mixed" | "unknown";
export type BotStateMode =
  | "idle"
  | "awaiting_categories"
  | "awaiting_time"
  | "awaiting_digest_filters"
  | "awaiting_clarification";

export type DigestFilters = {
  realEstate?: {
    locationMarker?: LocationMarker;
    maxPriceVnd?: number;
  };
};

export type ParsedQuery = {
  keywords: string[];
  categories?: AdCategory[];
  dateFrom?: Date;
  dateTo?: Date;
  hasMedia?: boolean;
  isQa?: boolean;
  priceRange?: { min?: number; max?: number };
  bikeFilters?: {
    dealType?: BikeDealType;
    brand?: string;
    model?: string;
    engineCc?: number;
    location?: LocationMarker | "vinh_hai" | "phuoc_long" | "an_vien" | "my_gia";
    period?: "day" | "week" | "month";
  };
  foodFilters?: {
    area?: LocationMarker;
    primaryCuisine?: "local" | "european" | "mixed" | "unknown";
    cuisineTag?: string;
  };
  visaranFilters?: {
    direction?: "laos" | "cambodia" | "thailand" | "mixed" | "unknown";
  };
  jobFilters?: {
    workFormat?: "remote" | "hybrid" | "onsite" | "unknown";
    employmentType?: "full_time" | "part_time" | "shift" | "unknown";
  };
  cityEventFilters?: {
    ticketRequired?: boolean;
  };
  casinoFilters?: {
    gameType?: "poker" | "casino" | "mixed" | "unknown";
    pokerFormat?: "cash" | "tournament" | "unknown";
  };
  excursionFilters?: {
    tourType?: "islands" | "diving" | "city_tour" | "waterfall" | "fishing" | "private" | "unknown";
  };
  currencyPairs?: CurrencyPair[];
  locationMarker?: LocationMarker;
  needsClarification: boolean;
  clarificationPrompt?: string;
};

export type SearchResult = {
  messageId: number;
  chatId: number;
  chatTitle?: string;
  date: Date;
  text: string;
  adCategory: AdCategory | string;
  score: number;
  link?: string;
  rubRateVnd?: number;
  usdRateVnd?: number;
  usdtRateVnd?: number;
  realEstate?: Record<string, unknown>;
  bike?: Record<string, unknown>;
};

export type AskResponse = {
  mode: "db_answer" | "llm_answer" | "clarification";
  text: string;
  sources: Array<{ chatId: number; messageId: number; link?: string }>;
};

export type MessageDoc = {
  _id: unknown;
  chat_id: number;
  chat_title?: string;
  message_id: number;
  sender_id?: number | null;
  date: Date;
  text: string;
  ad_category: AdCategory | string;
  media_links?: string[];
  has_media?: boolean;
  is_qa?: boolean;
  status: "active" | "edited" | "deleted";
  classification_confidence?: number;
  extracted_currency?: Partial<Record<CurrencyPair, unknown>>;
  extracted_bike?: {
    is_bike_ad?: boolean;
    deal_type?: BikeDealType;
    bike_brand?: string;
    bike_model?: string;
    engine_cc?: number;
    location?: {
      raw?: string;
      normalized?: string;
      district?: string;
    } | null;
    price_primary?: {
      amount?: number;
      currency?: string;
      period?: string;
    } | null;
    condition?: string;
    year?: number;
    mileage_km?: number;
  } | Record<string, unknown> | null;
  extracted_real_estate?: {
    parser_version?: string;
    price_detected?: boolean;
    location?: {
      normalized?: string;
      district?: string;
      complex?: string;
    } | null;
    contract_term?: {
      min_months?: number;
      max_months?: number;
    } | null;
    other_expenses?: {
      electricity_vnd_per_kwh?: number;
      water_vnd_per_person_month?: number;
      management_fee_vnd_per_person?: number;
    } | null;
    price_primary?: {
      amount?: number;
      currency?: string;
      period?: string;
    };
  } | Record<string, unknown> | null;
};

export type ChatCatalogDoc = {
  chat_id: number;
  title: string;
  selected_by_filter: boolean;
};

export type UserDigestSubscriptionDoc = {
  user_id: number;
  chat_id: number | null;
  enabled: boolean;
  categories: AdCategory[];
  filters?: DigestFilters;
  time_local: string;
  timezone: string;
  last_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type BotUserStateDoc = {
  user_id: number;
  mode: BotStateMode;
  payload: Record<string, unknown> | null;
  updated_at: Date;
};

export type LlmFallbackEventDoc = {
  question: string;
  reason: "parse_fail_or_needs_clarification" | "low_results";
  candidates_count: number;
  parsed_keywords_count: number;
  parsed_categories?: string[];
  response_mode: "clarification" | "llm_answer";
  llm_enabled: boolean;
  created_at: Date;
};
