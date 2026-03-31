import { DateTime } from "luxon";
import { config } from "../../config.js";
import type { MessagesRepository } from "../../db/repositories/messagesRepository.js";
import { DIGEST_CATEGORY_LABELS, type AdCategory, type SearchResult } from "../../types/domain.js";

const DIGEST_LOOKBACK_HOURS = 24;
const DIGEST_LIMIT_PER_CATEGORY = 5;
const PREVIEW_MAX_LEN = 120;
const DIGEST_MAX_MESSAGE_LEN = 3500;

function toCategoryLabel(category: string): string {
  return DIGEST_CATEGORY_LABELS[category as AdCategory] ?? category;
}

function sanitizeDigestText(text: string): string {
  return String(text || "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactPreview(text: string): string {
  const normalized = sanitizeDigestText(text);
  if (normalized.length <= PREVIEW_MAX_LEN) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_MAX_LEN - 3).trimEnd()}...`;
}

function sanitizeLink(link: string | undefined): string {
  return sanitizeDigestText(link ?? "");
}

function flushChunk(chunks: string[], lines: string[]): void {
  const text = lines.join("\n").trim();
  if (text) {
    chunks.push(text);
  }
}

function splitDigestMessages(headerLines: string[], sections: string[]): string[] {
  const chunks: string[] = [];
  let currentLines = [...headerLines];

  for (const section of sections) {
    const candidate = [...currentLines, "", section].join("\n");
    if (candidate.length <= DIGEST_MAX_MESSAGE_LEN) {
      currentLines = [...currentLines, "", section];
      continue;
    }

    if (currentLines.length > headerLines.length) {
      flushChunk(chunks, currentLines);
      currentLines = [...headerLines, "", section];
      continue;
    }

    const lines = section.split("\n");
    let nestedLines = [...headerLines];
    for (const line of lines) {
      const nestedCandidate = [...nestedLines, "", line].join("\n");
      if (nestedCandidate.length > DIGEST_MAX_MESSAGE_LEN && nestedLines.length > headerLines.length) {
        flushChunk(chunks, nestedLines);
        nestedLines = [...headerLines, "", line];
      } else {
        nestedLines = [...nestedLines, "", line];
      }
    }
    currentLines = nestedLines;
  }

  flushChunk(chunks, currentLines);
  return chunks;
}

export class DigestService {
  constructor(private readonly messagesRepository: MessagesRepository) {}

  async buildDigest(params: {
    categories: string[];
    timezone?: string;
    now?: Date;
  }): Promise<{ text: string; messages: string[]; items: SearchResult[]; sectionCount: number; itemCount: number }> {
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
      const emptyText = "За последние 24 часа по выбранным категориям новых сообщений нет.";
      return {
        text: emptyText,
        messages: [emptyText],
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
        const safeLink = sanitizeLink(item.link);
        return `${idx + 1}. ${preview}${safeLink ? `\n   ${safeLink}` : ""}`;
      });

      sections.push(`${toCategoryLabel(category)} (${group.length})\n${lines.join("\n")}`);
    }

    const period = `${fromLocal.toFormat("dd.MM HH:mm")} - ${toLocal.toFormat("dd.MM HH:mm")}`;
    const headerLines = ["Ежедневный обзор за 24 часа", `${period} (${timezone})`];
    const messages = splitDigestMessages(headerLines, sections);

    return {
      text: messages.join("\n\n"),
      messages,
      items,
      sectionCount,
      itemCount: items.length
    };
  }
}
