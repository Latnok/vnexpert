import type { Collection, Db } from "mongodb";
import type { CurrencyPair } from "../../types/domain.js";

type OfficialRatesDoc = {
  source: "cbr";
  requested_date: string;
  cbr_date: string;
  rates: Partial<Record<CurrencyPair, number>>;
  fetched_at: Date;
};

export class OfficialRatesRepository {
  private readonly collection: Collection<OfficialRatesDoc>;

  constructor(db: Db) {
    this.collection = db.collection<OfficialRatesDoc>("official_rates");
  }

  async getForDay(source: "cbr", requestedDate: string): Promise<OfficialRatesDoc | null> {
    return this.collection.findOne({ source, requested_date: requestedDate });
  }

  async upsertForDay(input: {
    source: "cbr";
    requestedDate: string;
    cbrDate: string;
    rates: Partial<Record<CurrencyPair, number>>;
  }): Promise<void> {
    await this.collection.updateOne(
      { source: input.source, requested_date: input.requestedDate },
      {
        $set: {
          cbr_date: input.cbrDate,
          rates: input.rates,
          fetched_at: new Date()
        }
      },
      { upsert: true }
    );
  }
}
