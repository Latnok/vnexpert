import type { Db } from "mongodb";
import { logger } from "../lib/logger.js";

async function createIndexSafe(
  op: () => Promise<string>,
  context: { collection: string; index: Record<string, 1 | -1 | "text"> }
): Promise<void> {
  try {
    await op();
  } catch (error) {
    const e = error as { code?: number; codeName?: string; message?: string };
    // Existing deployments may already have equivalent indexes with different names/options.
    if (e.code === 85 || e.codeName === "IndexOptionsConflict") {
      logger.warn({ context, error: e.message }, "Index conflict ignored");
      return;
    }
    throw error;
  }
}

export async function ensureIndexes(db: Db): Promise<void> {
  const messages = db.collection("messages");
  await createIndexSafe(
    () => messages.createIndex({ chat_id: 1, message_id: 1 }, { unique: true, background: true }),
    { collection: "messages", index: { chat_id: 1, message_id: 1 } }
  );
  await createIndexSafe(
    () => messages.createIndex({ ad_category: 1, date: -1 }, { background: true }),
    { collection: "messages", index: { ad_category: 1, date: -1 } }
  );
  await createIndexSafe(
    () => messages.createIndex({ chat_id: 1, date: -1 }, { background: true }),
    { collection: "messages", index: { chat_id: 1, date: -1 } }
  );
  await createIndexSafe(
    () => messages.createIndex({ text: "text" }, { background: true, default_language: "russian" }),
    { collection: "messages", index: { text: "text" } }
  );

  const chatCatalog = db.collection("chat_catalog");
  await createIndexSafe(
    () => chatCatalog.createIndex({ chat_id: 1 }, { unique: true, background: true }),
    { collection: "chat_catalog", index: { chat_id: 1 } }
  );
  await createIndexSafe(
    () => chatCatalog.createIndex({ selected_by_filter: 1, title: 1 }, { background: true }),
    { collection: "chat_catalog", index: { selected_by_filter: 1, title: 1 } }
  );

  const userDigest = db.collection("user_digest_subscriptions");
  await createIndexSafe(
    () => userDigest.createIndex({ user_id: 1 }, { unique: true, background: true }),
    { collection: "user_digest_subscriptions", index: { user_id: 1 } }
  );
  await createIndexSafe(
    () => userDigest.createIndex({ enabled: 1, timezone: 1, time_local: 1 }, { background: true }),
    { collection: "user_digest_subscriptions", index: { enabled: 1, timezone: 1, time_local: 1 } }
  );

  const botState = db.collection("bot_user_state");
  await createIndexSafe(
    () => botState.createIndex({ user_id: 1 }, { unique: true, background: true }),
    { collection: "bot_user_state", index: { user_id: 1 } }
  );

  const fallbackEvents = db.collection("llm_fallback_events");
  await createIndexSafe(
    () => fallbackEvents.createIndex({ created_at: -1 }, { background: true }),
    { collection: "llm_fallback_events", index: { created_at: -1 } }
  );

  const officialRates = db.collection("official_rates");
  await createIndexSafe(
    () => officialRates.createIndex({ source: 1, requested_date: 1 }, { unique: true, background: true }),
    { collection: "official_rates", index: { source: 1, requested_date: 1 } }
  );
  await createIndexSafe(
    () => officialRates.createIndex({ fetched_at: -1 }, { background: true }),
    { collection: "official_rates", index: { fetched_at: -1 } }
  );
}
