import { DateTime } from "luxon";
import {
  AD_CATEGORIES,
  type AdCategory,
  type BikeDealType,
  type CurrencyPair,
  type LocationMarker,
  type ParsedQuery
} from "../../types/domain.js";

const STOP_WORDS = new Set([
  "покажи",
  "найди",
  "мне",
  "и",
  "в",
  "на",
  "по",
  "а",
  "или",
  "что",
  "где",
  "qa",
  "вопрос",
  "вопросы",
  "ответ",
  "ответы"
]);

const CATEGORY_HINTS: Record<AdCategory, string[]> = {
  real_estate_rent: [
    "жилье",
    "жильё",
    "жиль",
    "апарт",
    "апартамент",
    "квартира",
    "квартир",
    "кондо",
    "condo",
    "студия",
    "студи",
    "комната",
    "комнат",
    "вилла",
    "дом",
    "недвиж",
    "аренда",
    "аренд",
    "снять",
    "сниму",
    "сдаю",
    "сдается",
    "rent",
    "longterm",
    "долгосрок",
    "посуточно"
  ],
  bike_rent: ["байк", "байки", "мотик", "мото", "скутер", "bike", "scooter", "honda", "yamaha", "аренда байка"],
  food_place: [
    "кафе",
    "ресторан",
    "бар",
    "кальян",
    "hookah",
    "lounge",
    "кофе",
    "кофейня",
    "еда",
    "поесть",
    "кухн",
    "европейск",
    "азиатск",
    "вьетнамск",
    "завтрак",
    "ужин",
    "food",
    "breakfast",
    "dinner"
  ],
  job_vacancy: ["вакансия", "работа", "ищем", "требуется", "нанимаем", "job", "vacancy", "hiring", "официант", "курьер"],
  city_event: [
    "событие",
    "события",
    "мероприятие",
    "мероприятия",
    "ивент",
    "ивенты",
    "концерт",
    "фестиваль",
    "вечеринка",
    "event",
    "party",
    "meetup"
  ],
  currency_exchange: ["обмен", "меняю", "валюта", "руб", "дол", "usd", "usdt", "rub", "vnd"],
  casino_poker: ["казино", "покер", "poker", "casino", "турнир", "ставки", "бет", "blackjack", "roulette"],
  visaran: ["визаран", "visa run", "виза ран", "бордер ран", "border run", "продление визы", "продлен", "виза", "визы"],
  excursions: ["экскурсия", "экскурсии", "тур", "туры", "поездка", "гид", "trip", "tour", "excursion", "острова", "дайвинг"],
  other_services: ["услуги", "сервис", "ремонт", "доставка", "уборка", "мастер", "service", "услуга"],
  ignored: [],
  other: ["разное", "прочее", "other"]
};

function extractPriceRange(text: string): { min?: number; max?: number } | undefined {
  const match = text.match(/(\d{2,8})\s*-\s*(\d{2,8})/);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return undefined;
    }
    if (min > max) {
      return { min: max, max: min };
    }
    return { min, max };
  }

  const comparatorMatch = text.match(
    /(?:до|дешевле|менее|не\s*дороже|не\s*выше|макс(?:имум)?|до\s*|от|дороже|не\s*дешевле|минимум)\s*(\d+(?:[.,]\d+)?)\s*(млн|миллион|м|тыс|к)?/i
  );
  if (!comparatorMatch) {
    return undefined;
  }

  const value = parsePriceNumber(comparatorMatch[1], comparatorMatch[2]);
  if (value === null) {
    return undefined;
  }
  const phrase = comparatorMatch[0].toLowerCase();
  if (
    phrase.includes("до") ||
    phrase.includes("дешевле") ||
    phrase.includes("менее") ||
    phrase.includes("не дороже") ||
    phrase.includes("не выше") ||
    phrase.includes("макс")
  ) {
    return { max: value };
  }
  if (phrase.includes("от") || phrase.includes("дороже") || phrase.includes("минимум") || phrase.includes("не дешевле")) {
    return { min: value };
  }

  return undefined;
}

function parsePriceNumber(rawNumber?: string, rawUnit?: string): number | null {
  if (!rawNumber) {
    return null;
  }
  const base = Number(rawNumber.replace(",", "."));
  if (!Number.isFinite(base)) {
    return null;
  }
  const unit = (rawUnit ?? "").toLowerCase();
  if (unit === "млн" || unit === "миллион" || unit === "м") {
    return Math.round(base * 1_000_000);
  }
  if (unit === "тыс" || unit === "к") {
    return Math.round(base * 1_000);
  }
  return Math.round(base);
}

function extractCategories(text: string): AdCategory[] | undefined {
  const found = AD_CATEGORIES.filter((category) => text.includes(category));
  for (const category of AD_CATEGORIES) {
    if (found.includes(category)) {
      continue;
    }
    const hints = CATEGORY_HINTS[category];
    if (hints.some((hint) => text.includes(hint))) {
      found.push(category);
    }
  }
  if (found.includes("food_place") && found.includes("real_estate_rent")) {
    return found.filter((cat) => cat !== "real_estate_rent");
  }
  return found.length ? found : undefined;
}

function extractCurrencyPairs(text: string): CurrencyPair[] | undefined {
  const pairs: CurrencyPair[] = [];
  if (/\brub\b/i.test(text) || /руб|рубл/i.test(text)) {
    pairs.push("vnd_rub");
  }
  if (text.includes("usdt")) {
    pairs.push("vnd_usdt");
  }
  if (/\busd\b/i.test(text) || text.includes("дол")) {
    pairs.push("vnd_usd");
  }
  return pairs.length ? pairs : undefined;
}

function extractLocationMarker(text: string): LocationMarker | undefined {
  if (/(?:^|\s)(?:на\s+)?юг(?:е|у)?(?=\s|$)|южн|(?:^|\s)south(?=\s|$)/i.test(text)) {
    return "south";
  }
  if (/(?:^|\s)(?:на\s+)?север(?:е|у)?(?=\s|$)|северн|(?:^|\s)north(?=\s|$)/i.test(text)) {
    return "north";
  }
  if (/(?:^|\s)(?:на\s+)?восток(?:е|у)?(?=\s|$)|восточн|(?:^|\s)east(?=\s|$)/i.test(text)) {
    return "east";
  }
  if (/(?:^|\s)(?:на\s+)?запад(?:е|у)?(?=\s|$)|западн|(?:^|\s)west(?=\s|$)/i.test(text)) {
    return "west";
  }
  if (/(?:^|\s)центр(?=\s|$)|(?:^|\s)center(?=\s|$)|(?:^|\s)central(?=\s|$)/i.test(text)) {
    return "center";
  }
  if (/юго-?запад|southwest/i.test(text)) {
    return "southwest";
  }
  return undefined;
}

function extractDateRange(text: string): { from?: Date; to?: Date } {
  const now = DateTime.now();
  if (text.includes("сегодня")) {
    return {
      from: now.startOf("day").toJSDate(),
      to: now.endOf("day").toJSDate()
    };
  }
  if (text.includes("вчера")) {
    const day = now.minus({ days: 1 });
    return {
      from: day.startOf("day").toJSDate(),
      to: day.endOf("day").toJSDate()
    };
  }
  return {};
}

function extractBikeDealType(text: string): BikeDealType | undefined {
  const isRent = /(аренд|прокат|rent|for\s+rent|thu[eê])/i.test(text);
  const isSale = /(продам|продаю|продажа|sale|sell|for\s+sale|b[aá]n|thanh\s+ly)/i.test(text);
  if (isRent && isSale) {
    return "mixed";
  }
  if (isRent) {
    return "rent";
  }
  if (isSale) {
    return "sale";
  }
  return undefined;
}

function extractBikeBrand(text: string): string | undefined {
  const brands = ["honda", "yamaha", "suzuki", "kawasaki", "piaggio", "vespa", "sym", "kymco", "vinfast"];
  return brands.find((b) => text.includes(b));
}

function extractBikeModel(text: string): string | undefined {
  const models = ["air blade", "vario", "nvx", "pcx", "click", "lead", "vision", "janus", "sirius", "winner", "exciter", "wave", "sh"];
  return models.find((m) => text.includes(m));
}

function extractBikeEngineCc(text: string): number | undefined {
  const match = text.match(/(\d{2,4})\s*cc\b/i);
  if (!match?.[1]) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractBikeLocation(
  text: string
): LocationMarker | "vinh_hai" | "phuoc_long" | "an_vien" | "my_gia" | undefined {
  if (/север|north/i.test(text)) {
    return "north";
  }
  if (/юг|south/i.test(text)) {
    return "south";
  }
  if (/центр|center/i.test(text)) {
    return "center";
  }
  if (/vinh\s*hai/i.test(text)) {
    return "vinh_hai";
  }
  if (/phuoc\s*long/i.test(text)) {
    return "phuoc_long";
  }
  if (/an\s*vien/i.test(text)) {
    return "an_vien";
  }
  if (/my\s*gia/i.test(text)) {
    return "my_gia";
  }
  return undefined;
}

function extractBikePeriod(text: string): "day" | "week" | "month" | undefined {
  if (/день|сутк|day|ng[aà]y/i.test(text)) {
    return "day";
  }
  if (/недел|week|tu[aầ]n/i.test(text)) {
    return "week";
  }
  if (/месяц|мес|month|th[aá]ng/i.test(text)) {
    return "month";
  }
  return undefined;
}

function extractFoodFilters(text: string): ParsedQuery["foodFilters"] | undefined {
  let area = extractLocationMarker(text);
  if (!area && /центр|в центре/i.test(text)) {
    area = "center";
  }
  if (!area && /север|на севере/i.test(text)) {
    area = "north";
  }
  if (!area && /юг|на юге/i.test(text)) {
    area = "south";
  }
  const cuisineTag = ["vietnamese", "italian", "steakhouse", "burger", "japanese", "korean"].find((tag) =>
    text.includes(tag)
  );
  let primaryCuisine: "local" | "european" | "mixed" | "unknown" | undefined;
  if (/вьетнам|vietnam|фо|bun|com tam/i.test(text)) {
    primaryCuisine = "local";
  } else if (/европ|europe|italian|pizza|pasta|steak|burger/i.test(text)) {
    primaryCuisine = "european";
  }
  if (!area && !cuisineTag && !primaryCuisine) {
    return undefined;
  }
  return { area, cuisineTag, primaryCuisine };
}

function extractVisaranFilters(text: string): ParsedQuery["visaranFilters"] | undefined {
  if (/лаос|laos/i.test(text)) {
    return { direction: "laos" };
  }
  if (/камбодж|cambodia/i.test(text)) {
    return { direction: "cambodia" };
  }
  if (/таиланд|тайланд|thailand/i.test(text)) {
    return { direction: "thailand" };
  }
  return undefined;
}

function extractJobFilters(text: string): ParsedQuery["jobFilters"] | undefined {
  let workFormat: "remote" | "hybrid" | "onsite" | "unknown" | undefined;
  if (/remote|удален|онлайн/i.test(text)) {
    workFormat = "remote";
  } else if (/hybrid|гибрид/i.test(text)) {
    workFormat = "hybrid";
  } else if (/офис|onsite|на месте/i.test(text)) {
    workFormat = "onsite";
  }

  let employmentType: "full_time" | "part_time" | "shift" | "unknown" | undefined;
  if (/full[-_\s]?time|полный день|фултайм/i.test(text)) {
    employmentType = "full_time";
  } else if (/part[-_\s]?time|частич|парттайм/i.test(text)) {
    employmentType = "part_time";
  } else if (/смен|shift/i.test(text)) {
    employmentType = "shift";
  }
  if (!workFormat && !employmentType) {
    return undefined;
  }
  return { workFormat, employmentType };
}

function extractCityEventFilters(text: string): ParsedQuery["cityEventFilters"] | undefined {
  if (/билет|ticket|вход платный|entry fee/i.test(text)) {
    return { ticketRequired: true };
  }
  if (/бесплатно|free entry|free/i.test(text)) {
    return { ticketRequired: false };
  }
  return undefined;
}

function extractCasinoFilters(text: string): ParsedQuery["casinoFilters"] | undefined {
  let gameType: "poker" | "casino" | "mixed" | "unknown" | undefined;
  const hasPoker = /покер|poker/i.test(text);
  const hasCasino = /казино|casino/i.test(text);
  if (hasPoker && hasCasino) {
    gameType = "mixed";
  } else if (hasPoker) {
    gameType = "poker";
  } else if (hasCasino) {
    gameType = "casino";
  }

  let pokerFormat: "cash" | "tournament" | "unknown" | undefined;
  if (/cash|кэш/i.test(text)) {
    pokerFormat = "cash";
  } else if (/турнир|tournament|mtt/i.test(text)) {
    pokerFormat = "tournament";
  }
  if (!gameType && !pokerFormat) {
    return undefined;
  }
  return { gameType, pokerFormat };
}

function extractExcursionFilters(text: string): ParsedQuery["excursionFilters"] | undefined {
  if (/остров|island/i.test(text)) {
    return { tourType: "islands" };
  }
  if (/дайв|diving/i.test(text)) {
    return { tourType: "diving" };
  }
  if (/city tour|обзорн|по городу/i.test(text)) {
    return { tourType: "city_tour" };
  }
  if (/водопад|waterfall/i.test(text)) {
    return { tourType: "waterfall" };
  }
  if (/рыбал|fishing/i.test(text)) {
    return { tourType: "fishing" };
  }
  if (/private|индивидуал/i.test(text)) {
    return { tourType: "private" };
  }
  return undefined;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token));
}

export function parseQuery(raw: string): ParsedQuery {
  const normalized = raw.trim().toLowerCase();
  const keywords = tokenize(normalized);
  const categories = extractCategories(normalized);
  const currencyPairs = extractCurrencyPairs(normalized);
  const locationMarker = extractLocationMarker(normalized);
  const bikeFilters =
    categories?.includes("bike_rent")
      ? {
          dealType: extractBikeDealType(normalized),
          brand: extractBikeBrand(normalized),
          model: extractBikeModel(normalized),
          engineCc: extractBikeEngineCc(normalized),
          location: extractBikeLocation(normalized),
          period: extractBikePeriod(normalized)
        }
      : undefined;
  const foodFilters = categories?.includes("food_place") ? extractFoodFilters(normalized) : undefined;
  const visaranFilters = categories?.includes("visaran") ? extractVisaranFilters(normalized) : undefined;
  const jobFilters = categories?.includes("job_vacancy") ? extractJobFilters(normalized) : undefined;
  const cityEventFilters = categories?.includes("city_event") ? extractCityEventFilters(normalized) : undefined;
  const casinoFilters = categories?.includes("casino_poker") ? extractCasinoFilters(normalized) : undefined;
  const excursionFilters = categories?.includes("excursions") ? extractExcursionFilters(normalized) : undefined;
  const priceRange = extractPriceRange(normalized);
  const dateRange = extractDateRange(normalized);

  const hasMedia = normalized.includes("фото") || normalized.includes("photo") ? true : undefined;
  const isQa =
    normalized.includes("вопрос") ||
    normalized.includes("ответ") ||
    /\bqa\b/.test(normalized) ||
    normalized.includes("q&a")
      ? true
      : undefined;

  let needsClarification = false;
  let clarificationPrompt: string | undefined;

  if (keywords.length === 0) {
    needsClarification = true;
    clarificationPrompt = "Не хватает ключевых слов. Уточните, что именно искать.";
  }
  const categoriesAllowingPriceRange: AdCategory[] = [
    "real_estate_rent",
    "bike_rent",
    "visaran",
    "job_vacancy",
    "city_event",
    "casino_poker",
    "excursions"
  ];
  if (priceRange && categories && !categories.some((cat) => categoriesAllowingPriceRange.includes(cat))) {
    needsClarification = true;
    clarificationPrompt = "Диапазон цены обычно применим к недвижимости. Уточните категорию поиска.";
  }

  return {
    keywords,
    categories,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    hasMedia,
    isQa,
    priceRange,
    bikeFilters,
    foodFilters,
    visaranFilters,
    jobFilters,
    cityEventFilters,
    casinoFilters,
    excursionFilters,
    currencyPairs,
    locationMarker,
    needsClarification,
    clarificationPrompt
  };
}
