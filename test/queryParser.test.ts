import { describe, expect, it } from "vitest";
import { parseQuery } from "../src/modules/search/queryParser.js";

describe("parseQuery", () => {
  it("extracts keywords and flags", () => {
    const parsed = parseQuery("Найди real_estate_rent с фото 1000-2000");
    expect(parsed.keywords.length).toBeGreaterThan(0);
    expect(parsed.categories).toEqual(["real_estate_rent"]);
    expect(parsed.hasMedia).toBe(true);
    expect(parsed.priceRange).toEqual({ min: 1000, max: 2000 });
  });

  it("detects real_estate_rent by natural language hints", () => {
    const parsed = parseQuery("где снять апарты, нужно жилье на месяц");
    expect(parsed.categories).toContain("real_estate_rent");
  });

  it("detects location marker for south queries", () => {
    const parsed = parseQuery("апарты на юге");
    expect(parsed.locationMarker).toBe("south");
    expect(parsed.categories).toContain("real_estate_rent");
  });

  it("extracts bike filters from bike query", () => {
    const parsed = parseQuery("аренда honda click 125cc на севере на месяц");
    expect(parsed.categories).toContain("bike_rent");
    expect(parsed.bikeFilters?.dealType).toBe("rent");
    expect(parsed.bikeFilters?.brand).toBe("honda");
    expect(parsed.bikeFilters?.model).toBe("click");
    expect(parsed.bikeFilters?.engineCc).toBe(125);
    expect(parsed.bikeFilters?.location).toBe("north");
    expect(parsed.bikeFilters?.period).toBe("month");
  });

  it("detects multiple categories by hints", () => {
    const bike = parseQuery("нужен байк в аренду на неделю");
    expect(bike.categories).toContain("bike_rent");

    const visaran = parseQuery("кто делает визаран и border run завтра");
    expect(visaran.categories).toContain("visaran");

    const currency = parseQuery("обмен usd usdt курс");
    expect(currency.categories).toContain("currency_exchange");

    const job = parseQuery("есть вакансия для курьера");
    expect(job.categories).toContain("job_vacancy");

    const food = parseQuery("посоветуйте кафе и ресторан");
    expect(food.categories).toContain("food_place");

    const event = parseQuery("какие сегодня ивенты и концерт");
    expect(event.categories).toContain("city_event");

    const tour = parseQuery("хочу экскурсию на острова");
    expect(tour.categories).toContain("excursions");

    const poker = parseQuery("где покер турнир");
    expect(poker.categories).toContain("casino_poker");

    const services = parseQuery("нужны услуги уборки квартиры");
    expect(services.categories).toContain("other_services");
  });

  it("parses examples from /start help", () => {
    const ex1 = parseQuery("где снять апарты у моря менее 12 млн в месяц");
    expect(ex1.categories).toContain("real_estate_rent");
    expect(ex1.priceRange).toEqual({ max: 12000000 });

    const ex2 = parseQuery("нужен байк в аренду на месяц");
    expect(ex2.categories).toContain("bike_rent");

    const ex3 = parseQuery("какие события в городе сегодня");
    expect(ex3.categories).toContain("city_event");

    const ex4 = parseQuery("кто делает визаран");
    expect(ex4.categories).toContain("visaran");

    const ex5 = parseQuery("обмен usdt сегодня");
    expect(ex5.categories).toContain("currency_exchange");
    expect(ex5.currencyPairs).toEqual(expect.arrayContaining(["vnd_usdt"]));

    const ex6 = parseQuery("вакансия для курьера");
    expect(ex6.categories).toContain("job_vacancy");

    const ex7 = parseQuery("вопрос: близжайший пляж для купания");
    expect(ex7.isQa).toBe(true);
  });

  it("parses comparator price filters for real estate", () => {
    const maxCase = parseQuery("Апартаменты дешевле 10 млн");
    expect(maxCase.categories).toContain("real_estate_rent");
    expect(maxCase.priceRange).toEqual({ max: 10000000 });

    const minCase = parseQuery("квартира от 8 млн");
    expect(minCase.categories).toContain("real_estate_rent");
    expect(minCase.priceRange).toEqual({ min: 8000000 });
  });

  it("parses broad multi-topic request with listed categories", () => {
    const parsed = parseQuery(
      "что ты можешь рассказать про аренду байков и события в городе, визарану, актуальный курс обмена, экскурсии, да и любые вопросы которые накопились"
    );
    expect(parsed.categories).toEqual(
      expect.arrayContaining(["bike_rent", "city_event", "visaran", "currency_exchange", "excursions"])
    );
    expect(parsed.isQa).toBe(true);
  });

  it("requires clarification for empty query", () => {
    const parsed = parseQuery("   ");
    expect(parsed.needsClarification).toBe(true);
    expect(parsed.clarificationPrompt).toBeTruthy();
  });
});
