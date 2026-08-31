/**
 * JSON CLI for the headless explore sim.
 * Usage: npm run ember-agent -- state
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmberAgentSession,
  persistEmberAgentSession,
  runEmberAgentCommand,
  type CardinalDir,
  type EmberAgentCommand,
  type EmberAgentPersisted,
  type EmberAgentSession,
} from "./emberAgent";
import { DEFAULT_AGENT_MAP_ID } from "./explorePackDisk";
import { createEmberAgentSaveBackend } from "./emberSaveFile";
import {
  DEFAULT_EMBER_PACK_ID,
  EMBER_SAVE_DEFAULT_SLOT,
  parseExploreSaveSlot,
} from "../content/emberSave";

const SESSION_DIR = path.join(os.tmpdir(), "joi-conductor");
const SESSION_FILE = path.join(SESSION_DIR, "ember-agent-session.json");

function printJson(value: unknown, exitCode: number): never {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(exitCode);
}

function isCardinalDir(value: string): value is CardinalDir {
  switch (value) {
    case "north":
    case "south":
    case "east":
    case "west":
      return true;
    default:
      return false;
  }
}

function readFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function readNumber(argv: string[], name: string): number | undefined {
  const raw = readFlag(argv, name);
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number`);
  }
  return n;
}

function readSlot(argv: string[], name = "--slot"): number | undefined {
  const raw = readFlag(argv, name);
  if (raw == null) return undefined;
  const slot = parseExploreSaveSlot(raw);
  if (slot == null) {
    throw new Error(
      `${name} must be an integer ${EMBER_SAVE_DEFAULT_SLOT}..9`,
    );
  }
  return slot;
}

function loadPersisted(): EmberAgentPersisted | undefined {
  try {
    return JSON.parse(
      readFileSync(SESSION_FILE, "utf8"),
    ) as EmberAgentPersisted;
  } catch {
    return undefined;
  }
}

function savePersisted(session: EmberAgentSession): void {
  mkdirSync(SESSION_DIR, { recursive: true });
  const tmp = `${SESSION_FILE}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(persistEmberAgentSession(session)));
  renameSync(tmp, SESSION_FILE);
}

const CLI_COMMANDS = [
  "state",
  "dump",
  "reset",
  "step",
  "walk-toward",
  "interact",
  "buy",
  "sell",
  "equip",
  "use",
  "save",
  "load",
  "reset-save",
  "copy-save",
] as const;

function parseCommand(argv: string[]): EmberAgentCommand {
  const cmd =
    argv.find((arg): arg is (typeof CLI_COMMANDS)[number] =>
      (CLI_COMMANDS as readonly string[]).includes(arg),
    ) ?? "state";
  switch (cmd) {
    case "state":
    case "dump":
      return { cmd };
    case "reset":
      return { cmd: "reset" };
    case "step": {
      const dirRaw = readFlag(argv, "--dir");
      const dx = readNumber(argv, "--dx");
      const dy = readNumber(argv, "--dy");
      const dt = readNumber(argv, "--dt");
      let dir: CardinalDir | undefined;
      if (dirRaw) {
        if (!isCardinalDir(dirRaw)) {
          throw new Error(`unknown --dir ${dirRaw} (north|south|east|west)`);
        }
        dir = dirRaw;
      }
      return { cmd: "step", dir, dx, dy, dt };
    }
    case "walk-toward":
      return {
        cmd: "walk-toward",
        to: readFlag(argv, "--to"),
        tx: readNumber(argv, "--tx"),
        ty: readNumber(argv, "--ty"),
        dt: readNumber(argv, "--dt"),
        ticks: readNumber(argv, "--ticks"),
      };
    case "interact":
      return { cmd: "interact" };
    case "buy": {
      const itemId = readFlag(argv, "--item");
      if (!itemId) throw new Error("buy needs --item <id>");
      return { cmd: "buy", itemId, shopId: readFlag(argv, "--shop") };
    }
    case "sell": {
      const itemId = readFlag(argv, "--item");
      if (!itemId) throw new Error("sell needs --item <id>");
      return { cmd: "sell", itemId, shopId: readFlag(argv, "--shop") };
    }
    case "equip": {
      const itemId = readFlag(argv, "--item");
      if (!itemId) throw new Error("equip needs --item <id>");
      return { cmd: "equip", itemId };
    }
    case "use": {
      const itemId = readFlag(argv, "--item");
      if (!itemId) throw new Error("use needs --item <id>");
      return { cmd: "use", itemId };
    }
    case "save":
      return { cmd: "save", slot: readSlot(argv) };
    case "load":
      return { cmd: "load", slot: readSlot(argv) };
    case "reset-save":
      return { cmd: "reset-save", slot: readSlot(argv) };
    case "copy-save": {
      const from = readSlot(argv, "--from");
      const to = readSlot(argv, "--to");
      if (from == null || to == null) {
        throw new Error("copy-save needs --from <slot> --to <slot>");
      }
      return { cmd: "copy-save", from, to };
    }
    default: {
      const _never: never = cmd;
      throw new Error(
        `unknown command ${_never} (state|dump|step|walk-toward|interact|buy|sell|equip|use|save|load|reset-save|copy-save|reset)`,
      );
    }
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  try {
    const mapId = readFlag(argv, "--map") ?? DEFAULT_AGENT_MAP_ID;
    const fresh = argv.includes("--reset");
    const persisted = fresh ? undefined : loadPersisted();
    const session = createEmberAgentSession({
      mapId: persisted?.mapId ?? mapId,
      packId: readFlag(argv, "--pack") ?? DEFAULT_EMBER_PACK_ID,
      persisted,
      saveBackend: createEmberAgentSaveBackend(),
    });
    const command = parseCommand(argv);
    const result = runEmberAgentCommand(session, command);
    savePersisted(session);
    printJson(result, 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printJson({ ok: false, error: message }, 1);
  }
}

main();
