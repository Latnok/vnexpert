type DedupeCandidate = {
  chat_id: number;
  message_id: number;
  sender_id?: number | null;
  text?: string;
  media_links?: string[];
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeMedia(links: string[]): string {
  return Array.from(new Set(links.map((link) => link.trim()).filter(Boolean))).sort().join("|");
}

function getMediaKey(candidate: DedupeCandidate): string | undefined {
  const mediaSignature = normalizeMedia(candidate.media_links ?? []);
  return mediaSignature ? `m:${mediaSignature}` : undefined;
}

function getTextKey(candidate: DedupeCandidate): string | undefined {
  const textSignature = normalizeText(candidate.text ?? "");
  return textSignature ? `t:${textSignature}` : undefined;
}

function getSenderKey(candidate: DedupeCandidate): string | undefined {
  if (candidate.sender_id !== null && candidate.sender_id !== undefined) {
    return `s:${candidate.sender_id}`;
  }
  return undefined;
}

function getUniqueFallbackKey(candidate: DedupeCandidate): string {
  return `u:${candidate.chat_id}:${candidate.message_id}`;
}

export function dedupeCandidates<T extends DedupeCandidate>(candidates: T[]): T[] {
  const seenMedia = new Set<string>();
  const seenText = new Set<string>();
  const seenSender = new Set<string>();
  const seenUnique = new Set<string>();
  const output: T[] = [];

  for (const candidate of candidates) {
    const mediaKey = getMediaKey(candidate);
    if (mediaKey && seenMedia.has(mediaKey)) {
      continue;
    }

    const textKey = getTextKey(candidate);
    if (textKey && seenText.has(textKey)) {
      continue;
    }

    // Sender is the weakest signal: use only when no media and no text.
    const senderKey = getSenderKey(candidate);
    if (!mediaKey && !textKey && senderKey && seenSender.has(senderKey)) {
      continue;
    }

    const uniqueKey = getUniqueFallbackKey(candidate);
    if (seenUnique.has(uniqueKey)) {
      continue;
    }

    if (mediaKey) {
      seenMedia.add(mediaKey);
    }
    if (textKey) {
      seenText.add(textKey);
    }
    if (!mediaKey && !textKey && senderKey) {
      seenSender.add(senderKey);
    }
    seenUnique.add(uniqueKey);
    output.push(candidate);
  }

  return output;
}

