import { describe, expect, it } from "vitest";
import { dedupeCandidates } from "../src/modules/search/dedupe.js";

describe("dedupeCandidates", () => {
  it("deduplicates by media first", () => {
    const input = [
      { chat_id: 1, message_id: 1, media_links: ["https://t.me/a/1"], text: "one", sender_id: 10 },
      { chat_id: 1, message_id: 2, media_links: ["https://t.me/a/1"], text: "two", sender_id: 11 }
    ];
    const output = dedupeCandidates(input);
    expect(output).toHaveLength(1);
    expect(output[0]?.message_id).toBe(1);
  });

  it("deduplicates by text when media is absent", () => {
    const input = [
      { chat_id: 1, message_id: 1, text: "Сдам квартиру у моря", sender_id: 10 },
      { chat_id: 2, message_id: 3, text: "  сдам   квартиру у моря ", sender_id: 99 }
    ];
    const output = dedupeCandidates(input);
    expect(output).toHaveLength(1);
    expect(output[0]?.message_id).toBe(1);
  });

  it("deduplicates by text even when media links differ", () => {
    const input = [
      {
        chat_id: 1,
        message_id: 10,
        media_links: ["https://t.me/chan/10"],
        text: "СДАЁТСЯ ДОМ NNC-2166 12 млн",
        sender_id: 100
      },
      {
        chat_id: 1,
        message_id: 11,
        media_links: ["https://t.me/chan/11"],
        text: "  сдаётся   дом nnc-2166 12 млн  ",
        sender_id: 101
      }
    ];
    const output = dedupeCandidates(input);
    expect(output).toHaveLength(1);
    expect(output[0]?.message_id).toBe(10);
  });

  it("deduplicates by sender when no media and no text", () => {
    const input = [
      { chat_id: 1, message_id: 1, sender_id: 42, text: "" },
      { chat_id: 2, message_id: 2, sender_id: 42, text: " " },
      { chat_id: 3, message_id: 3, sender_id: 84, text: " " }
    ];
    const output = dedupeCandidates(input);
    expect(output).toHaveLength(2);
    expect(output.map((x) => x.message_id)).toEqual([1, 3]);
  });

  it("deduplicates real estate reposts by structured extracted fields", () => {
    const input = [
      {
        chat_id: 1,
        message_id: 101,
        ad_category: "real_estate_rent",
        text: "A",
        extracted_real_estate: {
          price_primary: { amount: 10000000, period: "month" },
          location: { district: "north", complex: "oceanus" },
          contract_term: { min_months: 6, max_months: 12 }
        }
      },
      {
        chat_id: 2,
        message_id: 202,
        ad_category: "real_estate_rent",
        text: "B",
        extracted_real_estate: {
          price_primary: { amount: 10000000, period: "month" },
          location: { district: "north", complex: "oceanus" },
          contract_term: { min_months: 6, max_months: 12 }
        }
      }
    ];
    const output = dedupeCandidates(input);
    expect(output).toHaveLength(1);
    expect(output[0]?.message_id).toBe(101);
  });
});
