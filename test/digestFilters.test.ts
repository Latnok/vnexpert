import { describe, expect, it, vi } from "vitest";
import { MessagesRepository } from "../src/db/repositories/messagesRepository.js";

describe("digest filters", () => {
  it("applies real estate location and max price only to real estate digest items", async () => {
    const toArray = vi.fn(async () => []);
    const limit = vi.fn(() => ({ toArray }));
    const sort = vi.fn(() => ({ limit }));
    const find = vi.fn((..._args: unknown[]) => ({ sort }));
    const db = {
      collection() {
        return { find };
      }
    };
    const repo = new MessagesRepository(db as never);

    await repo.digestMessages({
      categories: ["real_estate_rent", "job_vacancy"],
      filters: {
        realEstate: {
          locationMarker: "south",
          maxPriceVnd: 12_000_000
        }
      },
      from: new Date("2026-03-09T00:00:00.000Z"),
      to: new Date("2026-03-10T00:00:00.000Z"),
      limitPerCategory: 5
    });

    const filter = find.mock.calls[0]?.[0] as { $and?: unknown[] };
    expect(filter).toMatchObject({
      status: { $in: ["active", "edited"] },
      ad_category: { $in: ["real_estate_rent", "job_vacancy"] },
      $and: [
        {
          $or: [
            { ad_category: { $ne: "real_estate_rent" } },
            {
              ad_category: "real_estate_rent",
              $and: [
                {
                  $or: [
                    { "extracted_real_estate.location.normalized": { $regex: "^south$", $options: "i" } },
                    { "extracted_real_estate.location.district": { $regex: "^south$", $options: "i" } }
                  ]
                },
                { "extracted_real_estate.price_primary.amount": { $lte: 12_000_000 } }
              ]
            }
          ]
        }
      ]
    });
  });

  it("requires structured bike price and extracted exchange rates for digest quality", async () => {
    const toArray = vi.fn(async () => []);
    const limit = vi.fn(() => ({ toArray }));
    const sort = vi.fn(() => ({ limit }));
    const find = vi.fn((..._args: unknown[]) => ({ sort }));
    const db = {
      collection() {
        return { find };
      }
    };
    const repo = new MessagesRepository(db as never);

    await repo.digestMessages({
      categories: ["bike_rent", "currency_exchange"],
      from: new Date("2026-03-09T00:00:00.000Z"),
      to: new Date("2026-03-10T00:00:00.000Z"),
      limitPerCategory: 5
    });

    const filter = find.mock.calls[0]?.[0];
    expect(filter.$and).toEqual(
      expect.arrayContaining([
        {
          $or: [
            { ad_category: { $ne: "bike_rent" } },
            {
              ad_category: "bike_rent",
              "extracted_bike.is_bike_ad": true,
              "extracted_bike.price_primary.amount": { $gt: 0 }
            }
          ]
        },
        {
          $or: [
            { ad_category: { $ne: "currency_exchange" } },
            {
              ad_category: "currency_exchange",
              $or: [
                { "extracted_currency.vnd_rub.vnd_per_unit": { $gt: 0 } },
                { "extracted_currency.vnd_usd.vnd_per_unit": { $gt: 0 } },
                { "extracted_currency.vnd_usdt.vnd_per_unit": { $gt: 0 } }
              ]
            }
          ]
        }
      ])
    );
  });
});
