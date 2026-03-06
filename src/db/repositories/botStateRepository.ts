import type { Collection, Db } from "mongodb";
import type { BotStateMode, BotUserStateDoc } from "../../types/domain.js";

export class BotStateRepository {
  private readonly collection: Collection<BotUserStateDoc>;

  constructor(db: Db) {
    this.collection = db.collection<BotUserStateDoc>("bot_user_state");
  }

  async get(userId: number): Promise<BotUserStateDoc | null> {
    return this.collection.findOne({ user_id: userId });
  }

  async set(userId: number, mode: BotStateMode, payload: Record<string, unknown> | null = null): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId },
      {
        $set: {
          mode,
          payload,
          updated_at: new Date()
        }
      },
      { upsert: true }
    );
  }
}

