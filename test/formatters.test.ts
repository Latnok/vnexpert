import { describe, expect, it } from "vitest";
import { buildCurrencyAnswer, buildDbAnswer } from "../src/modules/search/formatters.js";
import type { SearchResult } from "../src/types/domain.js";

describe("buildDbAnswer", () => {
  it("formats real_estate_rent only from parser fields", () => {
    const result: SearchResult = {
      messageId: 1,
      chatId: 100,
      date: new Date("2026-03-05T10:00:00.000Z"),
      text: "RAW TEXT THAT MUST NOT BE USED",
      adCategory: "real_estate_rent",
      score: 1,
      link: "https://t.me/c/100/1",
      realEstate: {
        location: { normalized: "center", district: "center", complex: "oceanus" },
        other_expenses: {
          electricity_vnd_per_kwh: 3500,
          water_vnd_per_person_month: 150000,
          management_fee_vnd_per_person: 100000
        },
        contract_term: { min_months: 3, max_months: 6 },
        price_primary: {
          amount: 11500000,
          currency: "VND",
          period: "month"
        }
      }
    };

    const response = buildDbAnswer("apartments up to 12 mln", [result]);
    expect(response.text).toContain("center");
    expect(response.text).toContain("oceanus");
    expect(response.text).toMatch(/11.?500.?000 VND month/);
    expect(response.text).toContain("электричество 3");
    expect(response.text).toContain("вода 150");
    expect(response.text).toContain("управление 100");
    expect(response.text).toContain("3-6 месяцев");
    expect(response.text).toContain("https://t.me/c/100/1");
    expect(response.text).toContain("Всего найдено 1 объявлений.");
    expect(response.text).not.toContain("RAW TEXT THAT MUST NOT BE USED");
    expect(response.text).not.toContain("[real_estate_rent]");
  });

  it("removes emoji from source text for non real-estate categories", () => {
    const result: SearchResult = {
      messageId: 2,
      chatId: 101,
      date: new Date("2026-03-05T10:00:00.000Z"),
      text: "🔥 Срочно нужен байк 🛵 на месяц",
      adCategory: "bike_rent",
      score: 1,
      link: "https://t.me/c/101/2"
    };

    const response = buildDbAnswer("байк", [result]);
    expect(response.text).not.toContain("1. ");
    expect(response.text).toContain("📝 Срочно нужен байк на месяц");
    expect(response.text).not.toContain("Объявление:");
    expect(response.text).toContain("📅 Дата публикации:");
    expect(response.text).toContain("────────────────────────");
    expect(response.text).toContain("Срочно нужен байк на месяц");
    expect(response.text).toContain("Всего найдено 1 объявлений.");
    expect(response.text).not.toContain("🔥");
    expect(response.text).not.toContain("🛵");
  });

  it("formats currency response with official rate block and unnumbered offers", () => {
    const result: SearchResult = {
      messageId: 10,
      chatId: 1,
      date: new Date("2026-03-06T10:00:00.000Z"),
      text: "курс usd",
      adCategory: "currency_exchange",
      score: 1,
      link: "https://t.me/c/1/10",
      usdRateVnd: 25700
    };

    const response = buildCurrencyAnswer([result], ["vnd_usd"], {
      source: "cbr",
      date: "06.03.2026",
      rates: { vnd_usd: 25055.123 }
    });
    expect(response.text).toContain("Оф. курс ЦБ РФ (06.03.2026):");
    expect(response.text).toContain("1 USD = 25055.123 VND");
    expect(response.text).toContain("Предложения обмена:");
    expect(response.text).toContain("1 USD = 25700 VND");
    expect(response.text).not.toContain("1. 1 USD");
    expect(response.text).toContain("────────────────────────");
    expect(
      [
        "Чтобы быстро перевести в рубли ценник надо VND поделить на 1000 и умножить на 3",
        "Никогда не переводите деньги заранее, никаких авансов",
        "Снять наличные VND с карты МИР можно в банкомате VRB"
      ].some((tip) => response.text.includes(tip))
    ).toBe(true);
  });

  it("sorts currency offers by latest publication date and then by better rate", () => {
    const old: SearchResult = {
      messageId: 11,
      chatId: 1,
      date: new Date("2026-03-05T09:00:00.000Z"),
      text: "old",
      adCategory: "currency_exchange",
      score: 1,
      usdRateVnd: 25000,
      link: "https://t.me/c/1/11"
    };
    const newerWorse: SearchResult = {
      messageId: 12,
      chatId: 1,
      date: new Date("2026-03-06T10:00:00.000Z"),
      text: "new-worse",
      adCategory: "currency_exchange",
      score: 1,
      usdRateVnd: 25200,
      link: "https://t.me/c/1/12"
    };
    const newerBetter: SearchResult = {
      messageId: 13,
      chatId: 1,
      date: new Date("2026-03-06T10:00:00.000Z"),
      text: "new-better",
      adCategory: "currency_exchange",
      score: 1,
      usdRateVnd: 25100,
      link: "https://t.me/c/1/13"
    };

    const response = buildCurrencyAnswer([old, newerWorse, newerBetter], ["vnd_usd"]);
    const idxBetter = response.text.indexOf("https://t.me/c/1/13");
    const idxWorse = response.text.indexOf("https://t.me/c/1/12");
    const idxOld = response.text.indexOf("https://t.me/c/1/11");
    expect(idxBetter).toBeGreaterThan(-1);
    expect(idxWorse).toBeGreaterThan(-1);
    expect(idxOld).toBeGreaterThan(-1);
    expect(idxBetter).toBeLessThan(idxWorse);
    expect(idxWorse).toBeLessThan(idxOld);
  });
});
