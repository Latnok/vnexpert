import type { Collection, Db, Filter, FindOptions, Sort } from "mongodb";
import { buildSearchFilter } from "../../modules/search/buildSearchFilter.js";
import { dedupeCandidates } from "../../modules/search/dedupe.js";
import type { DigestFilters, MessageDoc, ParsedQuery, SearchResult } from "../../types/domain.js";
import { buildTelegramMessageLink } from "../../lib/messageLinks.js";

function extractRubRateFromDoc(doc: MessageDoc): number | undefined {
  const rate = (doc.extracted_currency as { vnd_rub?: { vnd_per_unit?: number } | null } | undefined)?.vnd_rub?.vnd_per_unit;
  return typeof rate === "number" && Number.isFinite(rate) ? rate : undefined;
}

function extractUsdRateFromDoc(doc: MessageDoc): number | undefined {
  const rate = (doc.extracted_currency as { vnd_usd?: { vnd_per_unit?: number } | null } | undefined)?.vnd_usd?.vnd_per_unit;
  return typeof rate === "number" && Number.isFinite(rate) ? rate : undefined;
}

function extractUsdtRateFromDoc(doc: MessageDoc): number | undefined {
  const rate = (doc.extracted_currency as { vnd_usdt?: { vnd_per_unit?: number } | null } | undefined)?.vnd_usdt?.vnd_per_unit;
  return typeof rate === "number" && Number.isFinite(rate) ? rate : undefined;
}

export class MessagesRepository {
  private readonly collection: Collection<MessageDoc>;

  constructor(db: Db) {
    this.collection = db.collection<MessageDoc>("messages");
  }

  async searchMessages(params: {
    parsed: ParsedQuery;
    allowedChatIds?: number[];
    dateFrom: Date;
    dateTo: Date;
    limit?: number;
  }): Promise<SearchResult[]> {
    const limit = params.limit ?? 20;
    const textSearch = params.parsed.keywords.join(" ").trim();
    const filter = buildSearchFilter({
      parsed: params.parsed,
      allowedChatIds: params.allowedChatIds,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      textSearch
    });

    const projection: FindOptions<MessageDoc>["projection"] = {
      chat_id: 1,
      chat_title: 1,
      message_id: 1,
      sender_id: 1,
      date: 1,
      text: 1,
      ad_category: 1,
      media_links: 1,
      extracted_currency: 1,
      extracted_real_estate: 1
    };
    let sort: Sort = { date: -1 };
    if (textSearch) {
      projection.score = { $meta: "textScore" };
      sort = { score: { $meta: "textScore" }, date: -1 };
    }

    const docs = await this.collection
      .find(filter as Filter<MessageDoc>, { projection })
      .sort(sort)
      .limit(limit * 5)
      .toArray();
    const deduped = dedupeCandidates(docs).slice(0, limit);
    return deduped.map((doc) => {
      const score = (doc as unknown as { score?: number }).score;
      return {
        messageId: doc.message_id,
        chatId: doc.chat_id,
        chatTitle: doc.chat_title,
        date: new Date(doc.date),
        text: doc.text ?? "",
        adCategory: doc.ad_category,
        score: typeof score === "number" ? score : 0,
        link: doc.media_links?.find((v) => v.includes("t.me/")) ?? doc.media_links?.[0] ?? buildTelegramMessageLink(doc.chat_id, doc.message_id),
        rubRateVnd: extractRubRateFromDoc(doc),
        usdRateVnd: extractUsdRateFromDoc(doc),
        usdtRateVnd: extractUsdtRateFromDoc(doc),
        realEstate: doc.extracted_real_estate && typeof doc.extracted_real_estate === "object" ? doc.extracted_real_estate : undefined
      };
    });
  }

  async digestMessages(params: {
    allowedChatIds?: number[];
    categories: string[];
    filters?: DigestFilters;
    from: Date;
    to: Date;
    limitPerCategory: number;
  }): Promise<SearchResult[]> {
    const filter: Filter<MessageDoc> = {
      status: { $in: ["active", "edited"] },
      ad_category: { $in: params.categories },
      date: { $gte: params.from, $lte: params.to }
    };
    if (params.allowedChatIds && params.allowedChatIds.length > 0) {
      filter.chat_id = { $in: params.allowedChatIds };
    }
    const realEstateClauses: Filter<MessageDoc>[] = [];
    const realEstateFilters = params.filters?.realEstate;
    if (realEstateFilters?.locationMarker) {
      const locationPattern = `^${realEstateFilters.locationMarker}$`;
      realEstateClauses.push({
        $or: [
          { "extracted_real_estate.location.normalized": { $regex: locationPattern, $options: "i" } },
          { "extracted_real_estate.location.district": { $regex: locationPattern, $options: "i" } }
        ]
      } as Filter<MessageDoc>);
    }
    if (realEstateFilters?.maxPriceVnd !== undefined) {
      realEstateClauses.push({
        "extracted_real_estate.price_primary.amount": { $lte: realEstateFilters.maxPriceVnd }
      } as Filter<MessageDoc>);
    }
    if (realEstateClauses.length > 0) {
      filter.$and = [
        {
          $or: [
            { ad_category: { $ne: "real_estate_rent" } },
            {
              ad_category: "real_estate_rent",
              $and: realEstateClauses
            } as Filter<MessageDoc>
          ]
        } as Filter<MessageDoc>
      ];
    }

    const docs = await this.collection
      .find(filter, {
        projection: {
          chat_id: 1,
          chat_title: 1,
          message_id: 1,
          sender_id: 1,
          date: 1,
          text: 1,
          ad_category: 1,
          media_links: 1,
          extracted_currency: 1,
          extracted_real_estate: 1
        }
      })
      .sort({ date: -1 })
      .limit(params.categories.length * params.limitPerCategory * 3)
      .toArray();
    const dedupedDocs = dedupeCandidates(docs);

    const groupedCount = new Map<string, number>();
    const picked: SearchResult[] = [];

    for (const doc of dedupedDocs) {
      const key = doc.ad_category;
      const count = groupedCount.get(key) ?? 0;
      if (count >= params.limitPerCategory) {
        continue;
      }
      groupedCount.set(key, count + 1);
      picked.push({
        messageId: doc.message_id,
        chatId: doc.chat_id,
        chatTitle: doc.chat_title,
        date: new Date(doc.date),
        text: doc.text ?? "",
        adCategory: doc.ad_category,
        score: 0,
        link: doc.media_links?.find((v) => v.includes("t.me/")) ?? doc.media_links?.[0] ?? buildTelegramMessageLink(doc.chat_id, doc.message_id),
        rubRateVnd: extractRubRateFromDoc(doc),
        usdRateVnd: extractUsdRateFromDoc(doc),
        usdtRateVnd: extractUsdtRateFromDoc(doc),
        realEstate: doc.extracted_real_estate && typeof doc.extracted_real_estate === "object" ? doc.extracted_real_estate : undefined
      });
    }

    return picked;
  }
}
