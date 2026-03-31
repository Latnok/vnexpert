import { describe, expect, it } from "vitest";
import { DigestService } from "../src/modules/digest/digestService.js";
import type { SearchResult } from "../src/types/domain.js";

function mkResult(params: {
  id: number;
  category: string;
  text: string;
  date?: string;
  link?: string;
}): SearchResult {
  return {
    messageId: params.id,
    chatId: 1,
    date: new Date(params.date ?? "2026-03-09T01:00:00.000Z"),
    text: params.text,
    adCategory: params.category,
    score: 0,
    link: params.link
  };
}

describe("DigestService", () => {
  it("returns compact empty digest text when there are no items", async () => {
    const repo = {
      async digestMessages(): Promise<SearchResult[]> {
        return [];
      }
    };

    const service = new DigestService(repo as never);
    const result = await service.buildDigest({
      categories: ["real_estate_rent"],
      timezone: "Asia/Bangkok",
      now: new Date("2026-03-10T02:00:00.000Z")
    });

    expect(result.text).toBe("За последние 24 часа по выбранным категориям новых сообщений нет.");
    expect(result.messages).toEqual(["За последние 24 часа по выбранным категориям новых сообщений нет."]);
    expect(result.sectionCount).toBe(0);
    expect(result.itemCount).toBe(0);
  });

  it("groups results by requested category order and uses readable labels", async () => {
    const repo = {
      async digestMessages(): Promise<SearchResult[]> {
        return [
          mkResult({ id: 1, category: "job_vacancy", text: "Ищем бариста", link: "https://t.me/c/1/1" }),
          mkResult({ id: 2, category: "real_estate_rent", text: "Студия у моря", link: "https://t.me/c/1/2" })
        ];
      }
    };

    const service = new DigestService(repo as never);
    const result = await service.buildDigest({
      categories: ["real_estate_rent", "job_vacancy"],
      timezone: "Asia/Bangkok",
      now: new Date("2026-03-10T02:00:00.000Z")
    });

    expect(result.messages).toHaveLength(1);
    expect(result.text).toContain("Ежедневный обзор за 24 часа");
    expect(result.text).toContain("09.03 09:00 - 10.03 09:00 (Asia/Bangkok)");
    expect(result.text.indexOf("Жилье (1)")).toBeLessThan(result.text.indexOf("Работа (1)"));
    expect(result.text).toContain("Жилье (1)");
    expect(result.text).toContain("Работа (1)");
  });

  it("keeps fresh shortlist and truncates long previews", async () => {
    const longText = "Очень длинное объявление ".repeat(10);
    const repo = {
      async digestMessages(): Promise<SearchResult[]> {
        return [
          mkResult({ id: 1, category: "bike_rent", text: longText, link: "https://t.me/c/1/1" }),
          mkResult({ id: 2, category: "bike_rent", text: "Второй байк", link: "https://t.me/c/1/2" }),
          mkResult({ id: 3, category: "bike_rent", text: "Третий байк", link: "https://t.me/c/1/3" }),
          mkResult({ id: 4, category: "bike_rent", text: "Четвертый байк", link: "https://t.me/c/1/4" }),
          mkResult({ id: 5, category: "bike_rent", text: "Пятый байк", link: "https://t.me/c/1/5" }),
          mkResult({ id: 6, category: "bike_rent", text: "Шестой байк", link: "https://t.me/c/1/6" })
        ];
      }
    };

    const service = new DigestService(repo as never);
    const result = await service.buildDigest({
      categories: ["bike_rent"],
      timezone: "Asia/Bangkok",
      now: new Date("2026-03-10T02:00:00.000Z")
    });

    expect(result.text).toContain("Байки (6)");
    expect(result.text).toContain("1. Очень длинное объявление");
    expect(result.text).toContain("...");
    expect(result.text).not.toContain("6. Шестой байк");
    expect(result.itemCount).toBe(6);
    expect(result.sectionCount).toBe(1);
  });

  it("splits oversized digest into multiple telegram-safe messages", async () => {
    const categories = Array.from({ length: 40 }, (_, idx) => `category_${idx + 1}`);

    const repo = {
      async digestMessages(): Promise<SearchResult[]> {
        return Array.from({ length: categories.length }, (_, idx) =>
          mkResult({
            id: idx + 1,
            category: categories[idx]!,
            text: `Объявление ${idx + 1} ` + "x".repeat(800),
            link: `https://t.me/c/1/${idx + 1}`
          })
        );
      }
    };

    const service = new DigestService(repo as never);
    const result = await service.buildDigest({
      categories: [...categories],
      timezone: "Asia/Bangkok",
      now: new Date("2026-03-10T02:00:00.000Z")
    });

    expect(result.messages.length).toBeGreaterThan(1);
    expect(result.messages.every((message) => message.length <= 3500)).toBe(true);
  });
});
