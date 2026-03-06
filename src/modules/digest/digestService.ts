import { DateTime } from "luxon";
import type { MessagesRepository } from "../../db/repositories/messagesRepository.js";
import type { SearchResult } from "../../types/domain.js";

export class DigestService {
  constructor(private readonly messagesRepository: MessagesRepository) {}

  async buildDigest(params: { categories: string[] }): Promise<{ text: string; items: SearchResult[] }> {
    const to = new Date();
    const from = DateTime.fromJSDate(to).minus({ hours: 24 }).toJSDate();
    const items = await this.messagesRepository.digestMessages({
      allowedChatIds: undefined,
      categories: params.categories,
      from,
      to,
      limitPerCategory: 10
    });

    if (items.length === 0) {
      return { text: "За последние 24 часа по выбранным категориям новых сообщений нет.", items: [] };
    }

    const groups = new Map<string, SearchResult[]>();
    for (const item of items) {
      const key = item.adCategory;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    const sections: string[] = [];
    for (const [category, group] of groups.entries()) {
      const lines = group.slice(0, 10).map((item, idx) => {
        const text = item.text.slice(0, 140).replace(/\s+/g, " ").trim();
        return `${idx + 1}. ${text}${item.link ? `\n   ${item.link}` : ""}`;
      });
      sections.push(`*${category}* (${group.length})\n${lines.join("\n")}`);
    }

    return {
      text: `Ежедневный обзор за 24 часа:\n\n${sections.join("\n\n")}`,
      items
    };
  }
}

