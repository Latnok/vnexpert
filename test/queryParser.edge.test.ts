import { describe, expect, it } from "vitest";
import { parseQuery } from "../src/modules/search/queryParser.js";

describe("parseQuery edge cases", () => {
  it("requires clarification for empty and noisy input", () => {
    const empty = parseQuery("   ");
    expect(empty.needsClarification).toBe(true);

    const noise = parseQuery("... ??? !!!");
    expect(noise.needsClarification).toBe(true);
  });

  it("does not classify excursion phrase as currency by substring", () => {
    const parsed = parseQuery("экскурсия на острова");
    expect(parsed.categories).toContain("excursions");
    expect(parsed.categories).not.toContain("currency_exchange");
  });

  it("keeps food priority over real_estate in mixed phrasing", () => {
    const parsed = parseQuery("где поесть и снять апарты");
    expect(parsed.categories).toContain("food_place");
    expect(parsed.categories).not.toContain("real_estate_rent");
  });

  it("does not set bike location for unknown district words", () => {
    const parsed = parseQuery("аренда байка в районе xyz на месяц");
    expect(parsed.categories).toContain("bike_rent");
    expect(parsed.bikeFilters?.location).toBeUndefined();
    expect(parsed.bikeFilters?.period).toBe("month");
  });

  it("ignores malformed price comparators", () => {
    const parsed = parseQuery("апарты до abc");
    expect(parsed.priceRange).toBeUndefined();
    expect(parsed.needsClarification).toBe(false);
  });

  it("treats 'куплю байк' as bike sale intent", () => {
    const parsed = parseQuery("куплю байк");
    expect(parsed.categories).toContain("bike_rent");
    expect(parsed.bikeFilters?.dealType).toBe("sale");
  });

  it("covers 16 additional edge scenarios", () => {
    const scenarios = [
      {
        q: "обмен usd",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("currency_exchange");
          expect(p.currencyPairs).toContain("vnd_usd");
        }
      },
      {
        q: "обмен rub usdt",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("currency_exchange");
          expect(p.currencyPairs).toEqual(expect.arrayContaining(["vnd_rub", "vnd_usdt"]));
        }
      },
      {
        q: "кафе south burger",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("food_place");
          expect(p.foodFilters?.area).toBe("south");
          expect(p.foodFilters?.cuisineTag).toBe("burger");
        }
      },
      {
        q: "где поесть в центре",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("food_place");
          expect(p.foodFilters?.area).toBe("center");
        }
      },
      {
        q: "визаран в камбоджу",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("visaran");
          expect(p.visaranFilters?.direction).toBe("cambodia");
        }
      },
      {
        q: "вакансия part time hybrid",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("job_vacancy");
          expect(p.jobFilters?.employmentType).toBe("part_time");
          expect(p.jobFilters?.workFormat).toBe("hybrid");
        }
      },
      {
        q: "событие билет нужен",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("city_event");
          expect(p.cityEventFilters?.ticketRequired).toBe(true);
        }
      },
      {
        q: "покер tournament",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("casino_poker");
          expect(p.casinoFilters?.gameType).toBe("poker");
          expect(p.casinoFilters?.pokerFormat).toBe("tournament");
        }
      },
      {
        q: "казино и покер",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("casino_poker");
          expect(p.casinoFilters?.gameType).toBe("mixed");
        }
      },
      {
        q: "экскурсия дайвинг",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("excursions");
          expect(p.excursionFilters?.tourType).toBe("diving");
        }
      },
      {
        q: "экскурсия private",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("excursions");
          expect(p.excursionFilters?.tourType).toBe("private");
        }
      },
      {
        q: "аренда байка honda 150cc на неделю на юге",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("bike_rent");
          expect(p.bikeFilters?.dealType).toBe("rent");
          expect(p.bikeFilters?.brand).toBe("honda");
          expect(p.bikeFilters?.engineCc).toBe(150);
          expect(p.bikeFilters?.period).toBe("week");
          expect(p.bikeFilters?.location).toBe("south");
        }
      },
      {
        q: "продаю yamaha 125cc",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("bike_rent");
          expect(p.bikeFilters?.dealType).toBe("sale");
          expect(p.bikeFilters?.brand).toBe("yamaha");
          expect(p.bikeFilters?.engineCc).toBe(125);
        }
      },
      {
        q: "аренда или продажа байка",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("bike_rent");
          expect(p.bikeFilters?.dealType).toBe("mixed");
        }
      },
      {
        q: "квартира от 8 млн",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("real_estate_rent");
          expect(p.priceRange?.min).toBe(8_000_000);
        }
      },
      {
        q: "апарты дешевле 6 млн на юге",
        check: (p: ReturnType<typeof parseQuery>) => {
          expect(p.categories).toContain("real_estate_rent");
          expect(p.priceRange?.max).toBe(6_000_000);
          expect(p.locationMarker).toBe("south");
        }
      }
    ];

    expect(scenarios).toHaveLength(16);
    for (const scenario of scenarios) {
      const parsed = parseQuery(scenario.q);
      expect(parsed.needsClarification, scenario.q).toBe(false);
      scenario.check(parsed);
    }
  });
});
