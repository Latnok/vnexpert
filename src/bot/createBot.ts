import { Bot } from "grammy";
import { DateTime } from "luxon";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import type { AskService } from "../modules/ask/askService.js";
import type { BotStateRepository } from "../db/repositories/botStateRepository.js";
import type { UserDigestRepository } from "../db/repositories/userDigestRepository.js";
import { AD_CATEGORIES, DIGEST_DEFAULT_CATEGORIES, type AdCategory } from "../types/domain.js";

type SearchContinuationPayload = {
  query: string;
  offset: number;
  limit: number;
};

export const COMMAND_SHORTCUTS = {
  aparts: "где снять апарты",
  weaver: "какая погода сегодня",
  rub: "курс рубля",
  usd: "курс usd",
  bike: "нужен байк в аренду"
} satisfies Record<string, string>;

function parseCategories(raw: string): AdCategory[] {
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  return unique.filter((v): v is AdCategory => AD_CATEGORIES.includes(v as AdCategory));
}

function isValidTime(raw: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw.trim());
}

function resolveTimezone(ctx: { from?: { language_code?: string } }): string {
  const lang = ctx.from?.language_code;
  if (!lang) {
    return config.defaultTimezone;
  }
  return config.defaultTimezone;
}

function isContinuationMarker(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return normalized === "давай" || normalized === "еще" || normalized === "ещё" || normalized === "дальше";
}

function parseContinuationPayload(payload: Record<string, unknown> | null | undefined): SearchContinuationPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  const offset = typeof payload.offset === "number" ? payload.offset : NaN;
  const limit = typeof payload.limit === "number" ? payload.limit : NaN;
  if (!query || !Number.isFinite(offset) || !Number.isFinite(limit) || offset < 0 || limit <= 0) {
    return null;
  }
  return {
    query,
    offset,
    limit
  };
}

async function replyWithoutLinkPreview(
  ctx: { reply: (text: string, extra?: Record<string, unknown>) => Promise<unknown> },
  text: string
): Promise<void> {
  await ctx.reply(text, {
    link_preview_options: { is_disabled: true }
  });
}

async function handleShortcutCommand(
  ctx: { reply: (text: string, extra?: Record<string, unknown>) => Promise<unknown> },
  askService: AskService,
  query: string
): Promise<void> {
  const response = await askService.handleQuestion(query);
  await replyWithoutLinkPreview(ctx, response.text);
}

export function buildStartMessage(): string {
  return [
    "Привет. Это vnexpert-бот для поиска объявлений и ежедневных обзоров.",
    "",
    "Что умеет:",
    "1) Поиск по объявлениям по ключевым словам и фильтрам.",
    "2) Ответы на общие вопросы о городе, визаране, курсах обмена и т.д.",
    "3) Персональный ежедневный обзор по выбранным категориям в удобное время.",
    "",
    "Ограничения поиска:",
    "- рекламные объявления: только за последние 7 дней;",
    "- обмен: только за последние 24 часа.",
    "",
    "Команды:",
    "/aparts - жилье",
    "/weaver - погода",
    "/rub - курс обмена рубля",
    "/usd - курс обмена доллара",
    "/bike - байки",
    "/digest - включить ежедневный обзор",
    "/categories - выбрать категории для обзора",
    "/time - настроить время обзора (HH:mm)",
    "/off - отключить обзор",
    "",
    "Примеры использования:",
    "где снять апарты у моря менее 12 млн в месяц",
    "нужен байк в аренду на месяц",
    "какие события в городе сегодня",
    "кто делает визаран",
    "обмен usdt сегодня",
    "вакансия для курьера",
    "вопрос: близжайший пляж для купания"
  ].join("\n");
}

export function createBot(params: {
  askService: AskService;
  botStateRepository: BotStateRepository;
  userDigestRepository: UserDigestRepository;
}): Bot {
  const bot = new Bot(config.botToken);

  bot.catch((error) => {
    logger.error({ error }, "Bot middleware error");
  });

  bot.command("start", async (ctx) => {
    await replyWithoutLinkPreview(ctx, buildStartMessage());
  });

  bot.command("ask", async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) {
      await replyWithoutLinkPreview(ctx, "Формат: /ask <запрос>");
      return;
    }
    const response = await params.askService.handleQuestion(text);
    await replyWithoutLinkPreview(ctx, response.text);
  });

  for (const [command, query] of Object.entries(COMMAND_SHORTCUTS)) {
    bot.command(command, async (ctx) => {
      await handleShortcutCommand(ctx, params.askService, query);
    });
  }

  bot.command("digest", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    const chatId = ctx.chat?.id ?? null;
    const timezone = resolveTimezone(ctx);
    const existing = await params.userDigestRepository.getByUserId(userId);
    const categories = existing?.categories?.length ? existing.categories : [...DIGEST_DEFAULT_CATEGORIES];
    const timeLocal = existing?.time_local ?? "09:00";
    await params.userDigestRepository.upsertSubscription({
      userId,
      chatId,
      enabled: true,
      categories,
      timeLocal,
      timezone
    });
    await params.botStateRepository.set(userId, "idle");
    await replyWithoutLinkPreview(
      ctx,
      `Ежедневный обзор включен. Категории: ${categories.join(", ")}. Время: ${timeLocal} (${timezone}).`
    );
  });

  bot.command("categories", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    await params.botStateRepository.set(userId, "awaiting_categories");
    await replyWithoutLinkPreview(
      ctx,
      `Доступные категории:\n${AD_CATEGORIES.join("\n")}\n\nОтправьте список через запятую, например:\nreal_estate_rent,job_vacancy`
    );
  });

  bot.command("time", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    await params.botStateRepository.set(userId, "awaiting_time");
    await replyWithoutLinkPreview(ctx, "Отправьте время обзора в формате HH:mm, например 09:00");
  });

  bot.command("off", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    await params.userDigestRepository.disable(userId);
    await params.botStateRepository.set(userId, "idle");
    await replyWithoutLinkPreview(ctx, "Ежедневный обзор отключен.");
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      return;
    }
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    const state = await params.botStateRepository.get(userId);
    if (state?.mode === "awaiting_categories") {
      const categories = parseCategories(text);
      if (categories.length === 0) {
        await replyWithoutLinkPreview(ctx, "Не удалось распознать категории. Используйте имена из списка команды /categories.");
        return;
      }
      const sub = await params.userDigestRepository.getByUserId(userId);
      if (!sub) {
        await replyWithoutLinkPreview(ctx, "Сначала включите обзор командой /digest.");
        return;
      }
      await params.userDigestRepository.updateCategories(userId, categories);
      await params.botStateRepository.set(userId, "idle");
      await replyWithoutLinkPreview(ctx, `Категории обновлены: ${categories.join(", ")}`);
      return;
    }
    if (state?.mode === "awaiting_time") {
      if (!isValidTime(text)) {
        await replyWithoutLinkPreview(ctx, "Неверный формат времени. Пример: 09:00");
        return;
      }
      const sub = await params.userDigestRepository.getByUserId(userId);
      if (!sub) {
        await replyWithoutLinkPreview(ctx, "Сначала включите обзор командой /digest.");
        return;
      }
      await params.userDigestRepository.updateTime(userId, text);
      await params.botStateRepository.set(userId, "idle");
      await replyWithoutLinkPreview(ctx, `Время обзора обновлено: ${text} (${sub.timezone})`);
      return;
    }
    if (isContinuationMarker(text)) {
      const continuation = parseContinuationPayload(state?.payload);
      if (!continuation) {
        await replyWithoutLinkPreview(ctx, "Нет активной выдачи для продолжения. Отправьте новый запрос.");
        return;
      }
      const response = await params.askService.handleQuestion(continuation.query, {
        offset: continuation.offset,
        limit: continuation.limit
      });
      if (response.mode !== "db_answer" || response.sources.length === 0) {
        await params.botStateRepository.set(userId, "idle");
        await replyWithoutLinkPreview(ctx, "Больше результатов нет. Отправьте новый запрос.");
        return;
      }
      await replyWithoutLinkPreview(ctx, response.text);
      if (response.sources.length < continuation.limit) {
        await params.botStateRepository.set(userId, "idle");
        return;
      }
      await params.botStateRepository.set(userId, "idle", {
        query: continuation.query,
        offset: continuation.offset + continuation.limit,
        limit: continuation.limit
      });
      return;
    }

    const response = await params.askService.handleQuestion(text);
    await replyWithoutLinkPreview(ctx, response.text);
    if (response.mode === "db_answer" && response.sources.length > 0) {
      await params.botStateRepository.set(userId, "idle", {
        query: text,
        offset: response.sources.length,
        limit: 5
      });
      return;
    }
    await params.botStateRepository.set(userId, "idle");
  });

  return bot;
}

export function toLocalDateString(timezone: string, date: Date): string {
  return DateTime.fromJSDate(date).setZone(timezone).toISODate() ?? "";
}
