import type { Collection, Db } from "mongodb";
import type { ChatCatalogDoc } from "../../types/domain.js";

export class ChatCatalogRepository {
  private readonly collection: Collection<ChatCatalogDoc>;

  constructor(db: Db) {
    this.collection = db.collection<ChatCatalogDoc>("chat_catalog");
  }

  async getAllowedChatIds(): Promise<number[]> {
    const docs = await this.collection.find({ selected_by_filter: true }, { projection: { chat_id: 1 } }).toArray();
    return docs.map((doc) => doc.chat_id);
  }

  async getAllChatIds(): Promise<number[]> {
    const docs = await this.collection.find({}, { projection: { chat_id: 1 } }).toArray();
    return docs.map((doc) => doc.chat_id);
  }
}
