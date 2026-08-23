import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  captureExploreSave,
  copyExploreSave,
  createLocalStorageSaveBackend,
  createMemorySaveBackend,
  deleteExploreSave,
  listExploreSaveSlots,
  parseExploreSave,
  readExploreSave,
  writeExploreSave,
} from "./emberSave";
import { createFileSaveBackend } from "../agent/emberSaveFile";
import {
  createEmberAgentSession,
  runEmberAgentCommand,
} from "../agent/emberAgent";
import { compactEquipment } from "./emberEquipment";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("ember explore save", () => {
  it("round-trips dump → save → load in a new sim", () => {
    const backend = createMemorySaveBackend();
    const session = createEmberAgentSession({
      mapId: "agent_sandbox",
      saveBackend: backend,
    });
    runEmberAgentCommand(session, { cmd: "walk-toward", to: "chest" });
    const looted = runEmberAgentCommand(session, { cmd: "interact" });
    expect(looted.inventory).toMatchObject({
      coin: 1,
      herb: 1,
      funeral_polearm: 1,
    });
    expect(looted.openedChests).toEqual(["agent_sandbox:chest"]);

    const saved = runEmberAgentCommand(session, { cmd: "save", slot: 1 });
    expect(saved.ok).toBe(true);
    expect(saved.slot).toBe(1);
    const stored = readExploreSave(backend, session.packId, 1);
    expect(stored?.mapId).toBe("agent_sandbox");
    expect(stored?.inventory).toEqual(looted.inventory);
    expect(stored?.openedChests).toEqual(looted.openedChests);

    const fresh = createEmberAgentSession({
      mapId: "agent_sandbox",
      packId: session.packId,
      saveBackend: backend,
    });
    expect(fresh.sim.dump().inventory).toEqual({});
    const loaded = runEmberAgentCommand(fresh, { cmd: "load", slot: 1 });
    expect(loaded.ok).toBe(true);
    expect(loaded.inventory).toEqual(looted.inventory);
    expect(loaded.openedChests).toEqual(["agent_sandbox:chest"]);
    expect(loaded.tile).toEqual(looted.tile);
    expect(loaded.equipment).toEqual(looted.equipment);
    expect(loaded.flags).toEqual(looted.flags);
  });

  it("keeps start inventory when the slot is empty", () => {
    const backend = createMemorySaveBackend();
    const session = createEmberAgentSession({
      mapId: "agent_sandbox",
      saveBackend: backend,
    });
    expect(session.sim.dump().inventory).toEqual({});
    const loaded = runEmberAgentCommand(session, { cmd: "load", slot: 0 });
    expect(loaded.ok).toBe(false);
    expect(loaded.inventory).toEqual({});
    expect(readExploreSave(backend, session.packId, 0)).toBeNull();
  });

  it("reset-save wipes the slot and restores sandbox start", () => {
    const backend = createMemorySaveBackend();
    const session = createEmberAgentSession({
      mapId: "agent_sandbox",
      saveBackend: backend,
    });
    runEmberAgentCommand(session, { cmd: "walk-toward", to: "chest" });
    runEmberAgentCommand(session, { cmd: "interact" });
    runEmberAgentCommand(session, { cmd: "save", slot: 0 });
    const reset = runEmberAgentCommand(session, { cmd: "reset-save", slot: 0 });
    expect(reset.ok).toBe(true);
    expect(reset.inventory).toEqual({});
    expect(reset.openedChests).toEqual([]);
    expect(readExploreSave(backend, session.packId, 0)).toBeNull();
    expect(reset.mapId).toBe("agent_sandbox");
  });

  it("copies a slot and lists occupied slots", () => {
    const backend = createMemorySaveBackend();
    const session = createEmberAgentSession({
      mapId: "agent_sandbox",
      saveBackend: backend,
    });
    runEmberAgentCommand(session, { cmd: "walk-toward", to: "notice" });
    runEmberAgentCommand(session, { cmd: "save", slot: 2 });
    const copied = copyExploreSave(backend, session.packId, 2, 4);
    expect(copied?.slot).toBe(4);
    expect(copied?.mapId).toBe("agent_sandbox");
    const slots = listExploreSaveSlots(backend, session.packId);
    expect(slots[2]?.empty).toBe(false);
    expect(slots[4]?.empty).toBe(false);
    expect(slots[0]?.empty).toBe(true);
    expect(deleteExploreSave(backend, session.packId, 2)).toBe(true);
    expect(readExploreSave(backend, session.packId, 2)).toBeNull();
    expect(readExploreSave(backend, session.packId, 4)?.mapId).toBe(
      "agent_sandbox",
    );
  });

  it("round-trips through localStorage and a debug JSON folder", () => {
    const dump = captureExploreSave({
      packId: "ember_p1",
      slot: 3,
      source: {
        mapId: "agent_sandbox",
        x: 120,
        y: 240,
        elev: 0,
        tile: { tx: 10, ty: 20 },
        inventory: { coin: 20, herb: 1 },
        equipment: compactEquipment({ weapon: "funeral_polearm" }),
        openedChests: ["agent_sandbox:chest"],
        shopStock: { village_kiosk: { herb: 2 } },
        flags: { sandbox_chain_done: true },
      },
      hp: 80,
      maxHp: 100,
    });
    expect(parseExploreSave(JSON.parse(JSON.stringify(dump)))).toEqual(dump);

    const ls = createLocalStorageSaveBackend();
    writeExploreSave(ls, dump);
    expect(readExploreSave(ls, "ember_p1", 3)?.hp).toBe(80);
    expect(readExploreSave(ls, "ember_p1", 3)?.flags.sandbox_chain_done).toBe(
      true,
    );

    const dir = mkdtempSync(path.join(os.tmpdir(), "ember-saves-"));
    try {
      const files = createFileSaveBackend(dir);
      writeExploreSave(files, dump);
      const loaded = readExploreSave(files, "ember_p1", 3);
      expect(loaded?.inventory).toEqual({ coin: 20, herb: 1 });
      expect(loaded?.shopStock.village_kiosk?.herb).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
