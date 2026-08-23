/**
 * Thin MCP stdio server wrapping the same explore sim as the ember-agent CLI.
 * Cursor speaks newline-delimited JSON-RPC (not LSP Content-Length).
 */
import {
  createEmberAgentSession,
  runEmberAgentCommand,
  type CardinalDir,
  type EmberAgentSession,
} from "./emberAgent";
import { DEFAULT_AGENT_MAP_ID } from "./explorePackDisk";
import { createEmberAgentSaveBackend } from "./emberSaveFile";
import { DEFAULT_EMBER_PACK_ID } from "../content/emberSave";

export const MCP_PROTOCOL_VERSION = "2024-11-05";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

export type McpToolName =
  | "get_state"
  | "step"
  | "walk_toward"
  | "interact"
  | "buy"
  | "sell"
  | "save"
  | "load"
  | "reset_save";

export const MCP_TOOLS: Array<{
  name: McpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}> = [
  {
    name: "get_state",
    description:
      "Dump headless Ember explore sim (tile, occupyingId, lastWarp, nearby, inventory, wallet).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "step",
    description:
      "One tick on map axes (not camera yaw): north/south/east/west or dx/dy.",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", enum: ["north", "south", "east", "west"] },
        dx: { type: "number" },
        dy: { type: "number" },
        dt: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "walk_toward",
    description:
      "Walk toward a region id (teleport_a, notice, chest) or tile tx/ty.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        tx: { type: "number" },
        ty: { type: "number" },
        dt: { type: "number" },
        ticks: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "interact",
    description:
      "Interact with occupying or facing trigger/chest/teleport or an object with an interactivity modifier. Chest reports catalog loot ids + names (or stub id) and inventory counts. Door/trigger with targetMapId changes the explore map. Shop returns wouldFire action shop plus shopId, wallet, and stock snapshot.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "buy",
    description:
      "Buy an item from the current/last shop (after interact on a kiosk). Spends coin. Optional shopId overrides the last shop.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        shopId: { type: "string" },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "sell",
    description:
      "Sell an inventory item to the current/last shop at catalog/listing sellPrice. Restocks if the shop lists that item. Optional shopId overrides the last shop.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        shopId: { type: "string" },
      },
      required: ["itemId"],
      additionalProperties: false,
    },
  },
  {
    name: "save",
    description:
      "Write current explore progress to a named slot (0-9, default 0). Disk: debug/ember-saves/<pack>/slot-N.json when CLI/MCP uses the file backend.",
    inputSchema: {
      type: "object",
      properties: { slot: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "load",
    description:
      "Load explore progress from a named slot into the live sim. Empty slot leaves start inventory.",
    inputSchema: {
      type: "object",
      properties: { slot: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "reset_save",
    description:
      "Delete a save slot (default 0) and reset the live sim to the current map start.",
    inputSchema: {
      type: "object",
      properties: { slot: { type: "number" } },
      additionalProperties: false,
    },
  },
];

function isCardinalDir(value: unknown): value is CardinalDir {
  return (
    value === "north" ||
    value === "south" ||
    value === "east" ||
    value === "west"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function jsonResult(
  value: unknown,
): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function handleMcpRequest(
  session: EmberAgentSession,
  method: string,
  params: unknown,
): unknown {
  switch (method) {
    case "initialize": {
      const rec = asRecord(params);
      const requested = rec.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && requested.length > 0
          ? requested
          : MCP_PROTOCOL_VERSION;
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ember-agent", version: "0.1.0" },
      };
    }
    case "notifications/initialized":
      return null;
    case "ping":
      return {};
    case "tools/list":
      return { tools: MCP_TOOLS };
    case "tools/call": {
      const rec = asRecord(params);
      const name = rec.name;
      const args = asRecord(rec.arguments);
      if (typeof name !== "string") {
        throw new Error("tools/call missing name");
      }
      return jsonResult(callMcpTool(session, name, args));
    }
    default:
      throw new Error(`unknown MCP method ${method}`);
  }
}

export function callMcpTool(
  session: EmberAgentSession,
  name: string,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "get_state":
      return runEmberAgentCommand(session, { cmd: "state" });
    case "step": {
      const dir = args.dir;
      const dx = typeof args.dx === "number" ? args.dx : undefined;
      const dy = typeof args.dy === "number" ? args.dy : undefined;
      const dt = typeof args.dt === "number" ? args.dt : undefined;
      if (dir !== undefined && !isCardinalDir(dir)) {
        throw new Error("step.dir must be north|south|east|west");
      }
      if (!dir && dx == null && dy == null) {
        throw new Error("step needs dir or dx/dy");
      }
      return runEmberAgentCommand(session, {
        cmd: "step",
        dir,
        dx,
        dy,
        dt,
      });
    }
    case "walk_toward":
      return runEmberAgentCommand(session, {
        cmd: "walk-toward",
        to: typeof args.to === "string" ? args.to : undefined,
        tx: typeof args.tx === "number" ? args.tx : undefined,
        ty: typeof args.ty === "number" ? args.ty : undefined,
        dt: typeof args.dt === "number" ? args.dt : undefined,
        ticks: typeof args.ticks === "number" ? args.ticks : undefined,
      });
    case "interact":
      return runEmberAgentCommand(session, { cmd: "interact" });
    case "buy": {
      const itemId = args.itemId;
      if (typeof itemId !== "string" || !itemId.trim()) {
        throw new Error("buy needs itemId");
      }
      return runEmberAgentCommand(session, {
        cmd: "buy",
        itemId: itemId.trim(),
        shopId: typeof args.shopId === "string" ? args.shopId : undefined,
      });
    }
    case "sell": {
      const itemId = args.itemId;
      if (typeof itemId !== "string" || !itemId.trim()) {
        throw new Error("sell needs itemId");
      }
      return runEmberAgentCommand(session, {
        cmd: "sell",
        itemId: itemId.trim(),
        shopId: typeof args.shopId === "string" ? args.shopId : undefined,
      });
    }
    case "save":
      return runEmberAgentCommand(session, {
        cmd: "save",
        slot: typeof args.slot === "number" ? args.slot : undefined,
      });
    case "load":
      return runEmberAgentCommand(session, {
        cmd: "load",
        slot: typeof args.slot === "number" ? args.slot : undefined,
      });
    case "reset_save":
      return runEmberAgentCommand(session, {
        cmd: "reset-save",
        slot: typeof args.slot === "number" ? args.slot : undefined,
      });
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

export function encodeMcpMessage(body: unknown): string {
  return `${JSON.stringify(body)}\n`;
}

/** Pull complete JSON-RPC messages: NDJSON (Cursor) or optional Content-Length. */
export function takeMcpFrames(buffer: string): {
  frames: string[];
  rest: string;
} {
  const frames: string[] = [];
  let rest = buffer;
  while (rest.length > 0) {
    if (rest.startsWith("\n") || rest.startsWith("\r")) {
      rest = rest.slice(1);
      continue;
    }
    if (/^Content-Length:/i.test(rest) || rest.startsWith("content-length:")) {
      const headerEnd = rest.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = rest.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        rest = rest.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (rest.length < start + length) break;
      frames.push(rest.slice(start, start + length));
      rest = rest.slice(start + length);
      continue;
    }
    const nl = rest.indexOf("\n");
    if (nl < 0) break;
    const line = rest.slice(0, nl).replace(/\r$/, "").trim();
    rest = rest.slice(nl + 1);
    if (line.length > 0) frames.push(line);
  }
  return { frames, rest };
}

function rpcError(id: JsonRpcId, message: string, code = -32603) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

export function dispatchJsonRpc(
  session: EmberAgentSession,
  msg: JsonRpcRequest,
): unknown | null {
  const id = msg.id ?? null;
  const method = msg.method ?? "";
  if (method.startsWith("notifications/")) {
    handleMcpRequest(session, method, msg.params);
    return null;
  }
  try {
    const result = handleMcpRequest(session, method, msg.params);
    return { jsonrpc: "2.0", id, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return rpcError(id, message);
  }
}

function serveStdio(): void {
  const mapId = process.env.EMBER_AGENT_MAP ?? DEFAULT_AGENT_MAP_ID;
  let session: EmberAgentSession;
  try {
    session = createEmberAgentSession({
      mapId,
      packId: process.env.EMBER_AGENT_PACK ?? DEFAULT_EMBER_PACK_ID,
      saveBackend: createEmberAgentSaveBackend(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`ember-agent mcp: failed to load map: ${message}\n`);
    process.exit(1);
    return;
  }
  let rest = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    rest += chunk;
    const taken = takeMcpFrames(rest);
    rest = taken.rest;
    for (const frame of taken.frames) {
      let parsed: JsonRpcRequest;
      try {
        parsed = JSON.parse(frame) as JsonRpcRequest;
      } catch {
        continue;
      }
      const reply = dispatchJsonRpc(session, parsed);
      if (reply) process.stdout.write(encodeMcpMessage(reply));
    }
  });
  process.stdin.on("error", (err) => {
    process.stderr.write(`ember-agent mcp stdin: ${err.message}\n`);
  });
  process.stdin.resume();
}

function launchedAsMcpServer(): boolean {
  return process.argv.some((arg) =>
    /emberAgentMcp\.(c?js|ts)$/i.test(arg.replace(/\\/g, "/")),
  );
}

if (launchedAsMcpServer()) serveStdio();
