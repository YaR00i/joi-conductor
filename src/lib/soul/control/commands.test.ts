import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../../test/localStorageMock";
import { setActiveMistress } from "../../mistress/activeMistress";
import {
  matchChatCommands,
  parseChatCommand,
  formatCommandHelp,
  unknownCommandNote,
} from "./commands";
import { listChatChips } from "./dispatch";
import { loadControlState } from "./store";
import { openMorningPack } from "./morning";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

describe("chat command catalog", () => {
  it("parses slash aliases", () => {
    expect(parseChatCommand("/помощь")).toEqual({ kind: "hit", id: "help" });
    expect(parseChatCommand("  /help extra")).toEqual({ kind: "hit", id: "help" });
    expect(parseChatCommand("/утро")).toEqual({ kind: "hit", id: "morning" });
    expect(parseChatCommand("/morning")).toEqual({ kind: "hit", id: "morning" });
    expect(parseChatCommand("привет")).toBeNull();
    expect(parseChatCommand("/неттакой")).toEqual({
      kind: "unknown",
      token: "/неттакой",
    });
  });

  it("lists help with every slash", () => {
    const help = formatCommandHelp();
    expect(help).toContain("/статус");
    expect(help).toContain("/утро");
    expect(help).toContain("/сессия");
    expect(help).toContain("/оффер");
    expect(help).toContain("/задание");
    expect(help).toContain("/кара");
    expect(unknownCommandNote("/x")).toContain("/помощь");
  });

  it("matches prefix while typing", () => {
    const hits = matchChatCommands("/се");
    expect(hits.some((c) => c.id === "session")).toBe(true);
  });

  it("force-opens morning pack for /утро", () => {
    const first = openMorningPack("hu_tao", new Date("2026-08-21T12:00:00"), {
      force: true,
    });
    expect(first.dispatch.phase).toBe("morning");
    expect(first.dispatch.morningIds.length).toBeGreaterThan(0);
    const again = openMorningPack("hu_tao", new Date("2026-08-21T18:00:00"), {
      force: true,
    });
    expect(again.dispatch.phase).toBe("morning");
    expect(again.dispatch.morningIds.length).toBeGreaterThan(0);
  });
});

describe("chat dispatch chips", () => {
  it("does not leave orphan agree/refuse when idle", () => {
    const state = loadControlState("hu_tao");
    const chips = listChatChips(
      {
        ...state,
        dispatch: {
          phase: "idle",
          morningIds: [],
          punishIds: [],
          taskIds: [],
          lastOfferDate: null,
        },
      },
      false,
    );
    expect(chips).toEqual([]);
  });

  it("keeps session offer buttons on the card, not as chips", () => {
    const state = loadControlState("hu_tao");
    const chips = listChatChips(
      {
        ...state,
        dispatch: {
          phase: "session_offer",
          morningIds: [],
          punishIds: [],
          taskIds: [],
          lastOfferDate: "2026-08-21",
        },
      },
      false,
    );
    expect(chips).toEqual([]);
  });
});
