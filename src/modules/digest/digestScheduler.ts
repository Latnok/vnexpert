import { DateTime } from "luxon";
import type { Bot } from "grammy";
import { logger } from "../../lib/logger.js";
import type { UserDigestRepository } from "../../db/repositories/userDigestRepository.js";
import type { DigestService } from "./digestService.js";

function isDueNow(params: { nowUtc: DateTime; timezone: string; timeLocal: string; lastSentAt: Date | null }): boolean {
  const nowLocal = params.nowUtc.setZone(params.timezone);
  const [hRaw, mRaw] = params.timeLocal.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m)) {
    return false;
  }
  if (nowLocal.hour !== h || nowLocal.minute !== m) {
    return false;
  }
  if (!params.lastSentAt) {
    return true;
  }
  const sentLocal = DateTime.fromJSDate(params.lastSentAt).setZone(params.timezone);
  return sentLocal.toISODate() !== nowLocal.toISODate();
}

export class DigestScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bot: Bot,
    private readonly digestRepository: UserDigestRepository,
    private readonly digestService: DigestService
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((error) => logger.error({ error }, "Digest tick failed"));
    }, 60_000);
    logger.info("Digest scheduler started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(now = DateTime.utc()): Promise<void> {
    const subs = await this.digestRepository.listEnabled();
    for (const sub of subs) {
      if (!isDueNow({ nowUtc: now, timezone: sub.timezone, timeLocal: sub.time_local, lastSentAt: sub.last_sent_at })) {
        continue;
      }
      const { messages, sectionCount, itemCount } = await this.digestService.buildDigest({
        categories: sub.categories,
        filters: sub.filters,
        timezone: sub.timezone,
        now: now.toJSDate()
      });
      const targetChatId = sub.chat_id ?? sub.user_id;
      for (const message of messages) {
        await this.bot.api.sendMessage(targetChatId, message);
      }
      await this.digestRepository.markSent(sub.user_id, now.toJSDate());
      logger.info(
        { userId: sub.user_id, sectionCount, itemCount, partCount: messages.length, empty: itemCount === 0 },
        "Digest sent"
      );
    }
  }
}
