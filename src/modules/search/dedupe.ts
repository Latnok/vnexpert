type DedupeCandidate = {
  chat_id: number;
  message_id: number;
  sender_id?: number | null;
  text?: string;
  media_links?: string[];
  ad_category?: string;
  extracted_real_estate?: unknown;
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

function getRealEstateKey(candidate: DedupeCandidate): string | undefined {
  if (candidate.ad_category !== "real_estate_rent") {
    return undefined;
  }
  const re = candidate.extracted_real_estate;
  if (!re || typeof re !== "object") {
    return undefined;
  }
  const src = re as Record<string, unknown>;
  const price = src.price_primary && typeof src.price_primary === "object" ? (src.price_primary as Record<string, unknown>) : undefined;
  const location = src.location && typeof src.location === "object" ? (src.location as Record<string, unknown>) : undefined;
  const contract =
    src.contract_term && typeof src.contract_term === "object" ? (src.contract_term as Record<string, unknown>) : undefined;

  const amount = typeof price?.amount === "number" ? price.amount : undefined;
  const period = typeof price?.period === "string" ? price.period.toLowerCase().trim() : "";
  const complex = typeof location?.complex === "string" ? location.complex.toLowerCase().trim() : "";
  const district = typeof location?.district === "string" ? location.district.toLowerCase().trim() : "";
  const minMonths = typeof contract?.min_months === "number" ? contract.min_months : undefined;
  const maxMonths = typeof contract?.max_months === "number" ? contract.max_months : undefined;
  if (amount === undefined && !complex && !district) {
    return undefined;
  }
  return `re:${amount ?? "na"}:${period}:${district}:${complex}:${minMonths ?? "na"}:${maxMonths ?? "na"}`;
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
  const seenRealEstate = new Set<string>();
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
    const realEstateKey = getRealEstateKey(candidate);
    if (realEstateKey && seenRealEstate.has(realEstateKey)) {
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
    if (realEstateKey) {
      seenRealEstate.add(realEstateKey);
    }
    if (!mediaKey && !textKey && senderKey) {
      seenSender.add(senderKey);
    }
    seenUnique.add(uniqueKey);
    output.push(candidate);
  }

  return output;
}
