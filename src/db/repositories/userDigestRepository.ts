import type { Collection, Db } from "mongodb";
import type { AdCategory, UserDigestSubscriptionDoc } from "../../types/domain.js";

export class UserDigestRepository {
  private readonly collection: Collection<UserDigestSubscriptionDoc>;

  constructor(db: Db) {
    this.collection = db.collection<UserDigestSubscriptionDoc>("user_digest_subscriptions");
  }

  async getByUserId(userId: number): Promise<UserDigestSubscriptionDoc | null> {
    return this.collection.findOne({ user_id: userId });
  }

  async upsertSubscription(params: {
    userId: number;
    chatId: number | null;
    enabled: boolean;
    categories: AdCategory[];
    timeLocal: string;
    timezone: string;
  }): Promise<UserDigestSubscriptionDoc> {
    const now = new Date();
    await this.collection.updateOne(
      { user_id: params.userId },
      {
        $set: {
          chat_id: params.chatId,
          enabled: params.enabled,
          categories: params.categories,
          time_local: params.timeLocal,
          timezone: params.timezone,
          updated_at: now
        },
        $setOnInsert: {
          created_at: now,
          last_sent_at: null
        }
      },
      { upsert: true }
    );
    const saved = await this.getByUserId(params.userId);
    if (!saved) {
      throw new Error("Subscription not saved");
    }
    return saved;
  }

  async updateCategories(userId: number, categories: AdCategory[]): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId },
      {
        $set: {
          categories,
          updated_at: new Date()
        }
      }
    );
  }

  async updateTime(userId: number, timeLocal: string): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId },
      {
        $set: {
          time_local: timeLocal,
          updated_at: new Date()
        }
      }
    );
  }

  async disable(userId: number): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId },
      {
        $set: {
          enabled: false,
          updated_at: new Date()
        }
      }
    );
  }

  async listEnabled(): Promise<UserDigestSubscriptionDoc[]> {
    return this.collection.find({ enabled: true }).toArray();
  }

  async markSent(userId: number, at: Date): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId },
      {
        $set: {
          last_sent_at: at,
          updated_at: new Date()
        }
      }
    );
  }
}

