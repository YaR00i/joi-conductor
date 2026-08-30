import { describe, expect, it } from "vitest";
import {
  isProjectElectronPath,
  isProjectViteCommandLine,
} from "./process-utils.mjs";

const ROOT = "C:\\Users\\novos\\Projects\\joi-conductor";

describe("isProjectViteCommandLine", () => {
  it("matches the launcher's absolute vite dev command", () => {
    expect(
      isProjectViteCommandLine(
        `node ${ROOT}\\node_modules\\vite\\bin\\vite.js --host 127.0.0.1 --port 5173 --strictPort`,
        ROOT,
      ),
    ).toBe(true);
  });

  it("matches vite preview with forward slashes", () => {
    expect(
      isProjectViteCommandLine(
        `node ${ROOT}/node_modules/vite/bin/vite.js preview --port 5173`,
        ROOT,
      ),
    ).toBe(true);
  });

  it("does not match vitest watchers sharing the repo path", () => {
    expect(
      isProjectViteCommandLine(
        `node ${ROOT}\\node_modules\\vitest\\dist\\cli.js --watch`,
        ROOT,
      ),
    ).toBe(false);
  });

  it("does not match another project's vite", () => {
    expect(
      isProjectViteCommandLine(
        "node C:\\other\\project\\node_modules\\vite\\bin\\vite.js --port 5173",
        ROOT,
      ),
    ).toBe(false);
  });

  it("does not match plain project scripts or empty input", () => {
    expect(
      isProjectViteCommandLine(`node ${ROOT}\\scripts\\launch-window.mjs`, ROOT),
    ).toBe(false);
    expect(isProjectViteCommandLine("", ROOT)).toBe(false);
    expect(isProjectViteCommandLine(null, ROOT)).toBe(false);
  });
});

describe("isProjectElectronPath", () => {
  it("matches the project's node_modules electron binary", () => {
    expect(
      isProjectElectronPath(
        `${ROOT}\\node_modules\\electron\\dist\\electron.exe`,
        ROOT,
      ),
    ).toBe(true);
  });

  it("rejects foreign, missing, or unrelated paths", () => {
    expect(
      isProjectElectronPath(
        "C:\\other\\node_modules\\electron\\dist\\electron.exe",
        ROOT,
      ),
    ).toBe(false);
    expect(isProjectElectronPath("", ROOT)).toBe(false);
    expect(isProjectElectronPath(undefined, ROOT)).toBe(false);
  });
});
