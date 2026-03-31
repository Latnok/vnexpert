import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { ensureIndexes } from "../../src/db/indexes.js";
import { MessagesRepository } from "../../src/db/repositories/messagesRepository.js";
import { SearchService } from "../../src/modules/search/searchService.js";
import { parseQuery } from "../../src/modules/search/queryParser.js";
import { AskService } from "../../src/modules/ask/askService.js";
import { FallbackEventsRepository } from "../../src/db/repositories/fallbackEventsRepository.js";
import { MongoFallbackEventTracker } from "../../src/modules/ask/mongoFallbackEventTracker.js";
import type { AskResponse, SearchResult } from "../../src/types/domain.js";

type LlmLike = {
  clarify: (question: string, promptHint?: string) => Promise<AskResponse>;
  answerWithSources: (question: string, candidates: SearchResult[]) => Promise<AskResponse>;
};

const TEST_URI = process.env.MONGODB_URI_TEST ?? "mongodb://localhost:27017/vnexpert_integration";

let client: MongoClient;
let db: Db;
let messagesRepository: MessagesRepository;
let searchService: SearchService;
let fallbackEventsRepository: FallbackEventsRepository;

async function insertAllowedChat(chatId: number): Promise<void> {
  await db.collection("chat_catalog").insertOne({
    chat_id: chatId,
    title: `chat-${chatId}`,
    selected_by_filter: true
  });
}

async function insertMessage(params: {
  chatId: number;
  messageId: number;
  senderId?: number;
  text: string;
  category: string;
  date: Date;
  mediaLinks?: string[];
  extractedCurrency?: Record<string, unknown>;
  extractedBike?: Record<string, unknown>;
}): Promise<void> {
  await db.collection("messages").insertOne({
    source: "telegram",
    chat_id: params.chatId,
    chat_title: `chat-${params.chatId}`,
    message_id: params.messageId,
    sender_id: params.senderId ?? null,
    date: params.date,
    created_at: new Date(),
    updated_at: new Date(),
    text: params.text,
    ad_category: params.category,
    status: "active",
    media_links: params.mediaLinks ?? [],
    has_media: (params.mediaLinks?.length ?? 0) > 0,
    extracted_currency: params.extractedCurrency,
    extracted_bike: params.extractedBike
  });
}

describe("integration: search + ask", () => {
  beforeAll(async () => {
    client = new MongoClient(TEST_URI);
    await client.connect();
    db = client.db();
    await ensureIndexes(db);
    messagesRepository = new MessagesRepository(db);
    searchService = new SearchService(messagesRepository);
    fallbackEventsRepository = new FallbackEventsRepository(db);
  });

  beforeEach(async () => {
    await db.collection("messages").deleteMany({});
    await db.collection("chat_catalog").deleteMany({});
    await db.collection("llm_fallback_events").deleteMany({});
  });

  afterAll(async () => {
    if (db) {
      await db.collection("messages").deleteMany({});
      await db.collection("chat_catalog").deleteMany({});
      await db.collection("llm_fallback_events").deleteMany({});
    }
    if (client) {
      await client.close();
    }
  });

  it("deduplicates search results by media first", async () => {
    await insertAllowedChat(1001);
    const now = new Date();
    await insertMessage({
      chatId: 1001,
      messageId: 1,
      senderId: 11,
      text: "Аренда байка Honda Click",
      category: "bike_rent",
      date: now,
      mediaLinks: ["https://t.me/c/1001/1"],
      extractedBike: { is_bike_ad: true, deal_type: "rent" }
    });
    await insertMessage({
      chatId: 1001,
      messageId: 2,
      senderId: 12,
      text: "Байк аренда недорого",
      category: "bike_rent",
      date: now,
      mediaLinks: ["https://t.me/c/1001/1"],
      extractedBike: { is_bike_ad: true, deal_type: "rent" }
    });
    await insertMessage({
      chatId: 1001,
      messageId: 3,
      senderId: 13,
      text: "Аренда байка Yamaha на месяц",
      category: "bike_rent",
      date: now,
      mediaLinks: ["https://t.me/c/1001/3"],
      extractedBike: { is_bike_ad: true, deal_type: "rent" }
    });

    const parsed = parseQuery("bike rent");
    const result = await searchService.search(parsed);
    expect(result).toHaveLength(2);
  });

  it("uses last 24h window for currency queries", async () => {
    await insertAllowedChat(2002);
    const now = new Date();
    await insertMessage({
      chatId: 2002,
      messageId: 10,
      text: "Обмен USD VND сегодня",
      category: "currency_exchange",
      date: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      extractedCurrency: { vnd_usd: { pair: "USD/VND", vnd_per_unit: 25000 } }
    });
    await insertMessage({
      chatId: 2002,
      messageId: 11,
      text: "Курс USD VND",
      category: "currency_exchange",
      date: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      extractedCurrency: { vnd_usd: { pair: "USD/VND", vnd_per_unit: 25100 } }
    });

    const parsed = parseQuery("обмен usd");
    const result = await searchService.search(parsed);
    expect(result.length).toBe(1);
    expect(result[0]?.messageId).toBe(10);
  });

  it("relaxes text constraint for currency queries like 'курс рубля'", async () => {
    await insertAllowedChat(2102);
    const now = new Date();
    await insertMessage({
      chatId: 2102,
      messageId: 12,
      text: "Обмен валют ежедневно",
      category: "currency_exchange",
      date: new Date(now.getTime() - 60 * 60 * 1000),
      extractedCurrency: { vnd_rub: { pair: "RUB/VND", vnd_per_unit: 320 } }
    });

    const parsed = parseQuery("курс рубля");
    const result = await searchService.search(parsed);
    expect(result.length).toBe(1);
    expect(result[0]?.messageId).toBe(12);
  });

  it("recalls currency category even when extracted pair is missing", async () => {
    await insertAllowedChat(2103);
    const now = new Date();
    await insertMessage({
      chatId: 2103,
      messageId: 13,
      text: "Обмен валют в личку",
      category: "currency_exchange",
      date: new Date(now.getTime() - 30 * 60 * 1000)
      // intentionally without extracted_currency
    });

    const parsed = parseQuery("обмен usdt");
    const result = await searchService.search(parsed);
    expect(result.length).toBe(1);
    expect(result[0]?.messageId).toBe(13);
  });

  it("falls back to all catalog chats for currency when allowed scope is empty", async () => {
    await db.collection("chat_catalog").insertMany([
      { chat_id: 2201, title: "allowed", selected_by_filter: true },
      { chat_id: 2202, title: "extra", selected_by_filter: false }
    ]);

    const now = new Date();
    await insertMessage({
      chatId: 2202,
      messageId: 14,
      text: "Обмен рублей, курс в лс",
      category: "currency_exchange",
      date: new Date(now.getTime() - 10 * 60 * 1000),
      extractedCurrency: { vnd_rub: { pair: "RUB/VND", vnd_per_unit: 320 } }
    });

    const parsed = parseQuery("курс рубля");
    const result = await searchService.search(parsed);
    expect(result.length).toBe(1);
    expect(result[0]?.messageId).toBe(14);
  });

  it("falls back to global messages for currency when chat_catalog is stale", async () => {
    await db.collection("chat_catalog").insertOne({ chat_id: 2301, title: "allowed", selected_by_filter: true });
    const now = new Date();
    await insertMessage({
      chatId: 999999, // not present in chat_catalog
      messageId: 15,
      text: "Обмен валют RUB USDT",
      category: "currency_exchange",
      date: new Date(now.getTime() - 5 * 60 * 1000),
      extractedCurrency: { vnd_rub: { pair: "RUB/VND", vnd_per_unit: 321 } }
    });

    const parsed = parseQuery("курс рубля");
    const result = await searchService.search(parsed);
    expect(result.length).toBe(1);
    expect(result[0]?.messageId).toBe(15);
  });

  it("falls back to clarify on parse failure", async () => {
    const llm: LlmLike = {
      clarify: async () => ({
        mode: "clarification",
        text: "Уточните что искать",
        sources: []
      }),
      answerWithSources: async () => ({
        mode: "llm_answer",
        text: "stub",
        sources: []
      })
    };
    const askService = new AskService(
      searchService,
      llm as never,
      new MongoFallbackEventTracker(fallbackEventsRepository)
    );
    const result = await askService.handleQuestion("   ");
    expect(result.mode).toBe("clarification");
    expect(result.text).toContain("Уточните");
    const fallbackEvents = await db.collection("llm_fallback_events").find({ reason: "parse_fail_or_needs_clarification" }).toArray();
    expect(fallbackEvents.length).toBe(1);
  });

  it("falls back to llm on low result count", async () => {
    await insertAllowedChat(3003);
    await insertMessage({
      chatId: 3003,
      messageId: 21,
      text: "Аренда квартиры студии",
      category: "real_estate_rent",
      date: new Date()
    });
    const llm: LlmLike = {
      clarify: async () => ({
        mode: "clarification",
        text: "clarify",
        sources: []
      }),
      answerWithSources: async (_q, candidates) => ({
        mode: "llm_answer",
        text: `llm with ${candidates.length} source`,
        sources: candidates.map((item) => ({ chatId: item.chatId, messageId: item.messageId, link: item.link }))
      })
    };
    const askService = new AskService(
      searchService,
      llm as never,
      new MongoFallbackEventTracker(fallbackEventsRepository)
    );
    const result = await askService.handleQuestion("аренда квартиры");
    expect(result.mode).toBe("llm_answer");
    expect(result.text).toContain("1 source");
    const fallbackEvents = await db.collection("llm_fallback_events").find({ reason: "low_results" }).toArray();
    expect(fallbackEvents.length).toBe(1);
  });

  it("returns compact rub rate + link for currency db answers", async () => {
    await insertAllowedChat(5005);
    await insertMessage({
      chatId: 5005,
      messageId: 41,
      text: "1 RUB = 322 VND, обмен в центре",
      category: "currency_exchange",
      date: new Date(),
      mediaLinks: ["https://t.me/c/5005/41"],
      extractedCurrency: { vnd_rub: { pair: "RUB/VND", vnd_per_unit: 322 } }
    });
    const llm: LlmLike = {
      clarify: async () => ({ mode: "clarification", text: "clarify", sources: [] }),
      answerWithSources: async () => ({ mode: "llm_answer", text: "fallback", sources: [] })
    };
    const askService = new AskService(searchService, llm as never, new MongoFallbackEventTracker(fallbackEventsRepository));
    const result = await askService.handleQuestion("курс рубля");
    expect(result.mode).toBe("db_answer");
    expect(result.text).toContain("1 RUB = 322 VND");
    expect(result.text).toContain("https://t.me/c/5005/41");
  });

  it("returns usd rate for usd query", async () => {
    await insertMessage({
      chatId: 5006,
      messageId: 42,
      text: "USD курс",
      category: "currency_exchange",
      date: new Date(),
      extractedCurrency: { vnd_usd: { pair: "USD/VND", vnd_per_unit: 2570000 } }
    });
    const llm: LlmLike = {
      clarify: async () => ({ mode: "clarification", text: "clarify", sources: [] }),
      answerWithSources: async () => ({ mode: "llm_answer", text: "fallback", sources: [] })
    };
    const askService = new AskService(searchService, llm as never, new MongoFallbackEventTracker(fallbackEventsRepository));
    const result = await askService.handleQuestion("курс usd");
    expect(result.mode).toBe("db_answer");
    expect(result.text).toContain("1 USD = 2570000 VND");
  });

  it("does not limit by time for qa-style queries", async () => {
    await insertAllowedChat(4004);
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.collection("messages").insertOne({
      source: "telegram",
      chat_id: 4004,
      chat_title: "chat-4004",
      message_id: 31,
      sender_id: 501,
      date: oldDate,
      created_at: new Date(),
      updated_at: new Date(),
      text: "Экскурсии на острова были отличные",
      ad_category: "excursions",
      status: "active",
      is_qa: true,
      media_links: [],
      has_media: false
    });

    const parsed = parseQuery("вопрос экскурсии");
    const result = await searchService.search(parsed);
    expect(result.length).toBe(1);
    expect(result[0]?.messageId).toBe(31);
  });
});
