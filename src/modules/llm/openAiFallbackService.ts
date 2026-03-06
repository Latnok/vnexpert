import OpenAI from "openai";
import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import type { AskResponse, SearchResult } from "../../types/domain.js";

export class OpenAiFallbackService {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;
  }

  async clarify(userQuestion: string, promptHint?: string): Promise<AskResponse> {
    if (!this.client) {
      return {
        mode: "clarification",
        text: promptHint ?? "Уточните параметры запроса: категория, период, ключевые слова.",
        sources: []
      };
    }

    const response = await this.client.responses.create({
      model: config.openAiModel,
      input: `System: Ты помощник по поиску в базе объявлений. Если запроса недостаточно, задай один короткий уточняющий вопрос.
User request: ${userQuestion}
Hint: ${promptHint ?? "нет"}`
    });
    const text = response.output_text?.trim();
    return {
      mode: "clarification",
      text: text || "Уточните, что именно нужно найти.",
      sources: []
    };
  }

  async answerWithSources(question: string, candidates: SearchResult[]): Promise<AskResponse> {
    const sources = candidates.slice(0, 5).map((item) => ({
      chatId: item.chatId,
      messageId: item.messageId,
      link: item.link
    }));

    if (!this.client) {
      const fallbackText = sources.length
        ? "Нужна дополнительная конкретика. Доступные источники подобраны, но без LLM лучше уточнить категорию и период."
        : "Не хватает данных для ответа. Уточните ключевые слова, категорию и период.";
      return {
        mode: "llm_answer",
        text: fallbackText,
        sources
      };
    }

    try {
      const context = candidates
        .slice(0, 8)
        .map(
          (item, index) =>
            `${index + 1}) category=${item.adCategory}; date=${item.date.toISOString()}; text=${item.text}; link=${item.link ?? "none"}`
        )
        .join("\n");
      const response = await this.client.responses.create({
        model: config.openAiModel,
        input: `System: Отвечай только по данным контекста. Если данных недостаточно - явно скажи и задай один уточняющий вопрос. Не выдумывай ссылки.
User question: ${question}
Context:
${context || "контекст пуст"}
Инструкция: дай короткий ответ на русском и укажи, если нужна дополнительная конкретика.`
      });
      return {
        mode: "llm_answer",
        text: response.output_text?.trim() || "Не удалось сформировать ответ, уточните запрос.",
        sources
      };
    } catch (error) {
      logger.error({ error }, "LLM fallback failed");
      return {
        mode: "llm_answer",
        text: "LLM временно недоступен. Уточните параметры поиска и повторите запрос.",
        sources
      };
    }
  }
}
