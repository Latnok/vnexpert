export function buildTelegramMessageLink(chatId: number, messageId: number): string | undefined {
  const chat = String(chatId);
  if (!chat.startsWith("-100")) {
    return undefined;
  }
  const internalId = chat.slice(4);
  if (!internalId) {
    return undefined;
  }
  return `https://t.me/c/${internalId}/${messageId}`;
}

