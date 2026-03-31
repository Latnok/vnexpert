import { DateTime } from "luxon";
import { describe, expect, it, vi } from "vitest";
import { DigestScheduler } from "../src/modules/digest/digestScheduler.js";

function utcDateTime(iso: string): DateTime<true> {
  return DateTime.fromJSDate(new Date(iso), { zone: "utc" }) as DateTime<true>;
}

describe("DigestScheduler", () => {
  it("sends digest only at due local minute and marks it sent", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const markSent = vi.fn(async () => undefined);
    const repo = {
      async listEnabled() {
        return [
          {
            user_id: 101,
            chat_id: 202,
            enabled: true,
            categories: ["real_estate_rent"],
            time_local: "09:00",
            timezone: "Asia/Bangkok",
            last_sent_at: null
          }
        ];
      },
      markSent
    };
    const digestService = {
      async buildDigest() {
        return {
          text: "digest",
          items: [],
          sectionCount: 0,
          itemCount: 0
        };
      }
    };

    const scheduler = new DigestScheduler({ api: { sendMessage } } as never, repo as never, digestService as never);
    await scheduler.tick(utcDateTime("2026-03-10T02:00:00.000Z"));

    expect(sendMessage).toHaveBeenCalledWith(202, "digest", { parse_mode: "Markdown" });
    expect(markSent).toHaveBeenCalledOnce();
  });

  it("does not send digest twice in the same local day", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const markSent = vi.fn(async () => undefined);
    const repo = {
      async listEnabled() {
        return [
          {
            user_id: 101,
            chat_id: null,
            enabled: true,
            categories: ["real_estate_rent"],
            time_local: "09:00",
            timezone: "Asia/Bangkok",
            last_sent_at: new Date("2026-03-10T01:30:00.000Z")
          }
        ];
      },
      markSent
    };
    const digestService = {
      async buildDigest() {
        return {
          text: "digest",
          items: [],
          sectionCount: 0,
          itemCount: 0
        };
      }
    };

    const scheduler = new DigestScheduler({ api: { sendMessage } } as never, repo as never, digestService as never);
    await scheduler.tick(utcDateTime("2026-03-10T02:00:00.000Z"));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
  });

  it("skips subscriptions that are not due yet", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const repo = {
      async listEnabled() {
        return [
          {
            user_id: 101,
            chat_id: 202,
            enabled: true,
            categories: ["real_estate_rent"],
            time_local: "09:00",
            timezone: "Asia/Bangkok",
            last_sent_at: null
          }
        ];
      },
      async markSent() {
        return undefined;
      }
    };
    const digestService = {
      async buildDigest() {
        return {
          text: "digest",
          items: [],
          sectionCount: 0,
          itemCount: 0
        };
      }
    };

    const scheduler = new DigestScheduler({ api: { sendMessage } } as never, repo as never, digestService as never);
    await scheduler.tick(utcDateTime("2026-03-10T01:59:00.000Z"));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
