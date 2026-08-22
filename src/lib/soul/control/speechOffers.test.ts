import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../../test/localStorageMock";
import { parseSpeechOffers } from "./speechOffers";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

const live = {
  moodScore: 0,
  cageOn: false,
  plugOn: false,
  denialOn: false,
};

describe("parseSpeechOffers", () => {
  it("offers cage and denial when she hedges both for today", () => {
    const offers = parseSpeechOffers(
      "Серёжа, я думаю… наверное, клетку на сегодня. Или, может, denial? Ты любишь, когда я довожу до края… и потом руиню оргазм.",
      live,
    );
    expect(offers.map((o) => o.kind).sort()).toEqual(["cage", "deny"]);
  });

  it("skips ritual cage inspect", () => {
    expect(
      parseSpeechOffers("Клетка на месте, госпожа. Осмотр клетки утром.", live),
    ).toEqual([]);
  });

  it("does not fire on flavor without an offer cue", () => {
    expect(
      parseSpeechOffers("В клетке тебе будет тесно, глупыш.", live),
    ).toEqual([]);
  });

  it("reads hours from speech", () => {
    const offers = parseSpeechOffers("Хочу клетку на 10 часов сегодня.", live);
    expect(offers[0]?.kind).toBe("cage");
    expect(offers[0]?.hours).toBe(10);
  });

  it("skips cage if already worn", () => {
    const offers = parseSpeechOffers("Клетку на сегодня, давай.", {
      ...live,
      cageOn: true,
    });
    expect(offers.some((o) => o.kind === "cage")).toBe(false);
  });
});
