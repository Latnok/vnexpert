import { describe, expect, it, vi } from "vitest";
import { CbrOfficialRateService } from "../src/modules/currency/officialRateService.js";

describe("CbrOfficialRateService", () => {
  it("parses VND and USD blocks correctly from XML", async () => {
    const xml = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="06.03.2026" name="Foreign Currency Market">
  <Valute ID="R01010">
    <CharCode>AUD</CharCode>
    <VunitRate>55,1474</VunitRate>
  </Valute>
  <Valute ID="R01150">
    <CharCode>VND</CharCode>
    <VunitRate>0,00312073</VunitRate>
  </Valute>
  <Valute ID="R01235">
    <CharCode>USD</CharCode>
    <VunitRate>78,19</VunitRate>
  </Valute>
</ValCurs>`;

    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => xml })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const service = new CbrOfficialRateService();
    const rates = await service.getOfficialVndRates(["vnd_rub", "vnd_usd"]);

    expect(rates).not.toBeNull();
    expect(rates?.date).toBe("06.03.2026");
    expect(rates?.rates.vnd_rub).toBeGreaterThan(300);
    expect(rates?.rates.vnd_rub).toBeLessThan(340);
    expect(rates?.rates.vnd_usd).toBeGreaterThan(20000);
    expect(rates?.rates.vnd_usd).toBeLessThan(30000);

    vi.unstubAllGlobals();
  });

  it("fetches only once per day when cached in repository", async () => {
    const xml = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs Date="06.03.2026" name="Foreign Currency Market">
  <Valute><CharCode>VND</CharCode><VunitRate>0,00312073</VunitRate></Valute>
  <Valute><CharCode>USD</CharCode><VunitRate>78,19</VunitRate></Valute>
</ValCurs>`;
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => xml })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const storage = new Map<string, { cbr_date: string; rates: Record<string, number> }>();
    const repo = {
      async getForDay(_source: "cbr", requestedDate: string) {
        const v = storage.get(requestedDate);
        if (!v) {
          return null;
        }
        return {
          source: "cbr" as const,
          requested_date: requestedDate,
          cbr_date: v.cbr_date,
          rates: v.rates,
          fetched_at: new Date()
        };
      },
      async upsertForDay(input: {
        source: "cbr";
        requestedDate: string;
        cbrDate: string;
        rates: Record<string, number>;
      }) {
        storage.set(input.requestedDate, { cbr_date: input.cbrDate, rates: input.rates });
      }
    };

    const service = new CbrOfficialRateService(repo as never);
    const r1 = await service.getOfficialVndRates(["vnd_usd"]);
    const r2 = await service.getOfficialVndRates(["vnd_usd"]);

    expect(r1?.rates.vnd_usd).toBeGreaterThan(20000);
    expect(r2?.rates.vnd_usd).toBeGreaterThan(20000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("returns null when remote API fails", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, text: async () => "" })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const service = new CbrOfficialRateService();
    const rates = await service.getOfficialVndRates(["vnd_usd"]);
    expect(rates).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
