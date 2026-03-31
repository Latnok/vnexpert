import { describe, expect, it } from "vitest";
import { buildStartMessage, COMMAND_SHORTCUTS } from "../src/bot/createBot.js";

describe("createBot command config", () => {
  it("defines shortcut commands with expected queries", () => {
    expect(COMMAND_SHORTCUTS).toEqual({
      aparts: "где снять апарты",
      weaver: "какая погода сегодня",
      rub: "курс рубля",
      usd: "курс usd",
      bike: "нужен байк в аренду"
    });
  });

  it("mentions shortcut commands in start message", () => {
    const text = buildStartMessage();

    expect(text).toContain("/aparts - жилье");
    expect(text).toContain("/weaver - погода");
    expect(text).toContain("/rub - курс обмена рубля");
    expect(text).toContain("/usd - курс обмена доллара");
    expect(text).toContain("/bike - байки");
  });
});
