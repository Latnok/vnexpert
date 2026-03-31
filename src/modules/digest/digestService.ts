import { DateTime } from "luxon";
import { config } from "../../config.js";
import type { MessagesRepository } from "../../db/repositories/messagesRepository.js";
import { DIGEST_CATEGORY_LABELS, type AdCategory, type SearchResult } from "../../types/domain.js";

const DIGEST_LOOKBACK_HOURS = 24;
const DIGEST_LIMIT_PER_CATEGORY = 5;
const PREVIEW_MAX_LEN = 120;

function toCategoryLabel(category: string): string {
  return DIGEST_CATEGORY_LABELS[category as AdCategory] ?? category;
}

function compactPreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_MAX_LEN) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_MAX_LEN - 1).trimEnd()}…`;
}

export class DigestService {
  constructor(private readonly messagesRepository: MessagesRepository) {}

  async buildDigest(params: {
    categories: string[];
    timezone?: string;
    now?: Date;
  }): Promise<{ text: string; items: SearchResult[]; sectionCount: number; itemCount: number }> {
    const timezone = params.timezone ?? config.defaultTimezone;
    const to = params.now ?? new Date();
    const toLocal = DateTime.fromJSDate(to).setZone(timezone);
    const fromLocal = toLocal.minus({ hours: DIGEST_LOOKBACK_HOURS });
    const from = fromLocal.toJSDate();

    const items = await this.messagesRepository.digestMessages({
      allowedChatIds: undefined,
      categories: params.categories,
      from,
      to,
      limitPerCategory: DIGEST_LIMIT_PER_CATEGORY
    });

    if (items.length === 0) {
      return {
        text: "За последние 24 часа по выбранным категориям новых сообщений нет.",
        items: [],
        sectionCount: 0,
        itemCount: 0
      };
    }

    const groups = new Map<string, SearchResult[]>();
    for (const item of items) {
      const key = item.adCategory;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    const sections: string[] = [];
    let sectionCount = 0;

    for (const category of params.categories) {
      const group = groups.get(category);
      if (!group || group.length === 0) {
        continue;
      }
      sectionCount += 1;
      const lines = group.slice(0, DIGEST_LIMIT_PER_CATEGORY).map((item, idx) => {
        const preview = compactPreview(item.text);
        return `${idx + 1}. ${preview}${item.link ? `\n   ${item.link}` : ""}`;
      });
      sections.push(`*${toCategoryLabel(category)}* (${group.length})\n${lines.join("\n")}`);
    }

    const period = `${fromLocal.toFormat("dd.MM HH:mm")} - ${toLocal.toFormat("dd.MM HH:mm")}`;
    return {
      text: [`Ежедневный обзор за 24 часа`, `${period} (${timezone})`, "", ...sections].join("\n"),
      items,
      sectionCount,
      itemCount: items.length
    };
  }
}
