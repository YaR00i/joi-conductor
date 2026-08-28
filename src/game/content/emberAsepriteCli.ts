/**
 * Import Aseprite files into Ember sprite registry.
 * Usage: npm run ember-aseprite -- import path.aseprite [--id spr_foo] [--name "Стол"]
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { asepriteSourceRel } from "./asepriteFile";
import {
  importAsepriteBytes,
  spriteIdFromAsepriteName,
} from "./asepriteImport";
import { resolveEmberContentRoot } from "../agent/explorePackDisk";
import { serializePixelSprite } from "./pixelSprite";
import type { EmberPixelSprite, EmberSpritesFile } from "./types";

type CliCommand = "import" | "help";

function printJson(value: unknown, exitCode: number): never {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(exitCode);
}

function readFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function parseCommand(raw: string | undefined): CliCommand {
  if (!raw || raw === "help" || raw === "-h" || raw === "--help") return "help";
  if (raw === "import") return "import";
  throw new Error(`Unknown command ${raw}. Use: import | help`);
}

function loadSpritesFile(filePath: string): EmberSpritesFile {
  if (!existsSync(filePath)) {
    return { paletteFavorites: [], sprites: [] };
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as EmberSpritesFile;
  return {
    paletteFavorites: parsed.paletteFavorites ?? [],
    sprites: Array.isArray(parsed.sprites) ? parsed.sprites : [],
  };
}

function writeSpritesFile(filePath: string, file: EmberSpritesFile): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

function upsertSprite(
  file: EmberSpritesFile,
  sprite: EmberPixelSprite,
): EmberSpritesFile {
  const sprites = file.sprites.filter((item) => item.id !== sprite.id);
  sprites.push(serializePixelSprite(sprite));
  sprites.sort((a, b) => a.id.localeCompare(b.id));
  return { ...file, sprites };
}

async function runImport(argv: string[]): Promise<void> {
  const fileArg = argv.find((arg) => !arg.startsWith("--") && arg !== "import");
  if (!fileArg) {
    throw new Error("import needs a .aseprite path");
  }
  const abs = path.resolve(fileArg);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const bytes = new Uint8Array(readFileSync(abs));
  const contentRoot = resolveEmberContentRoot();
  const registryPath = path.join(contentRoot, "sprites", "registry.json");
  const registry = loadSpritesFile(registryPath);
  const requestedId = readFlag(argv, "--id");
  const id = requestedId?.trim() || spriteIdFromAsepriteName(path.basename(abs));
  const existing = registry.sprites.find((item) => item.id === id);
  const nameRu = readFlag(argv, "--name") ?? existing?.nameRu;
  const result = await importAsepriteBytes(bytes, { id, nameRu, existing });
  if (!result.ok) {
    printJson({ ok: false, error: result.error }, 1);
  }
  const next = upsertSprite(registry, result.sprite);
  writeSpritesFile(registryPath, next);
  const sourceRel = asepriteSourceRel(result.sprite.id);
  const sourceAbs = path.join(contentRoot, sourceRel);
  mkdirSync(path.dirname(sourceAbs), { recursive: true });
  copyFileSync(abs, sourceAbs);
  printJson(
    {
      ok: true,
      id: result.sprite.id,
      width: result.sprite.width,
      height: result.sprite.topHeight,
      layers: result.sprite.artLayers?.length ?? 1,
      frames: result.sprite.frames?.length ?? 1,
      replaced: !!existing,
      source: sourceRel,
      warnings: result.warnings,
    },
    0,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let command: CliCommand;
  try {
    command = parseCommand(argv[0]);
  } catch (err) {
    printJson(
      { ok: false, error: err instanceof Error ? err.message : "bad command" },
      1,
    );
  }
  switch (command) {
    case "help":
      printJson(
        {
          ok: true,
          usage:
            "npm run ember-aseprite -- import <file.aseprite> [--id spr_foo] [--name Name]",
        },
        0,
      );
      break;
    case "import":
      await runImport(argv);
      break;
    default: {
      const _never: never = command;
      throw new Error(`Unhandled ${_never}`);
    }
  }
}

void main().catch((err) => {
  printJson(
    { ok: false, error: err instanceof Error ? err.message : String(err) },
    1,
  );
});
