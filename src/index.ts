import { assertRequiredConfig } from "./config.js";
import { ensureIndexes } from "./db/indexes.js";
import { closeMongo, connectMongo } from "./db/mongo.js";
import { BotStateRepository } from "./db/repositories/botStateRepository.js";
import { FallbackEventsRepository } from "./db/repositories/fallbackEventsRepository.js";
import { MessagesRepository } from "./db/repositories/messagesRepository.js";
import { UserDigestRepository } from "./db/repositories/userDigestRepository.js";
import { logger } from "./lib/logger.js";
import { AskService } from "./modules/ask/askService.js";
import { MongoFallbackEventTracker } from "./modules/ask/mongoFallbackEventTracker.js";
import { DigestScheduler } from "./modules/digest/digestScheduler.js";
import { DigestService } from "./modules/digest/digestService.js";
import { OpenAiFallbackService } from "./modules/llm/openAiFallbackService.js";
import { SearchService } from "./modules/search/searchService.js";
import { createBot } from "./bot/createBot.js";
import { CbrOfficialRateService } from "./modules/currency/officialRateService.js";
import { OfficialRatesRepository } from "./db/repositories/officialRatesRepository.js";
import { OpenMeteoWeatherService } from "./modules/weather/weatherService.js";

async function bootstrap(): Promise<void> {
  assertRequiredConfig();
  const db = await connectMongo();
  await ensureIndexes(db);

  const messagesRepository = new MessagesRepository(db);
  const userDigestRepository = new UserDigestRepository(db);
  const botStateRepository = new BotStateRepository(db);
  const fallbackEventsRepository = new FallbackEventsRepository(db);
  const officialRatesRepository = new OfficialRatesRepository(db);

  const searchService = new SearchService(messagesRepository);
  const llmService = new OpenAiFallbackService();
  const officialRateService = new CbrOfficialRateService(officialRatesRepository);
  const weatherService = new OpenMeteoWeatherService();
  const fallbackEventTracker = new MongoFallbackEventTracker(fallbackEventsRepository);
  const askService = new AskService(searchService, llmService, fallbackEventTracker, officialRateService, weatherService);
  const digestService = new DigestService(messagesRepository, weatherService, officialRateService);

  const bot = createBot({
    askService,
    botStateRepository,
    userDigestRepository
  });
  const scheduler = new DigestScheduler(bot, userDigestRepository, digestService);

  const shutdown = async () => {
    logger.info("Shutting down...");
    scheduler.stop();
    await bot.stop();
    await closeMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  scheduler.start();
  await bot.start();
  logger.info("Bot started");
}

bootstrap().catch((error) => {
  logger.error({ error }, "Fatal bootstrap error");
  process.exit(1);
});
