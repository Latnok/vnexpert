import { describe, expect, it } from "vitest";
import { toLocalDateString } from "../src/bot/createBot.js";

describe("toLocalDateString", () => {
  it("converts date to local day", () => {
    const value = toLocalDateString("Asia/Bangkok", new Date("2026-03-01T23:30:00.000Z"));
    expect(value).toBe("2026-03-02");
  });
});

