import type { Collection, Db } from "mongodb";
import type { LlmFallbackEventDoc } from "../../types/domain.js";

export class FallbackEventsRepository {
  private readonly collection: Collection<LlmFallbackEventDoc>;

  constructor(db: Db) {
    this.collection = db.collection<LlmFallbackEventDoc>("llm_fallback_events");
  }

  async insert(event: Omit<LlmFallbackEventDoc, "created_at">): Promise<void> {
    await this.collection.insertOne({
      ...event,
      created_at: new Date()
    });
  }
}

