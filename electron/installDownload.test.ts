import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloadFile } from "./installDownload.mjs";

let server: Server;
let baseUrl = "";
let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "joi-dl-"));
  server = createServer((req, res) => {
    if (req.url === "/ok") {
      const body = Buffer.from("hello-joi-download");
      res.writeHead(200, { "content-length": body.length });
      res.end(body);
      return;
    }
    if (req.url === "/stall") {
      res.writeHead(200, { "content-length": 100 });
      res.write("abc");
      // Never finishes — simulates a silently dead connection.
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(301, { location: `${baseUrl}/ok` });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end("nope");
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("no server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("downloadFile", () => {
  it("downloads a file and reports progress", async () => {
    const dest = path.join(tmpDir, "ok.bin");
    const pcts: number[] = [];
    await downloadFile(`${baseUrl}/ok`, dest, (p) => pcts.push(p), 5000);
    expect(readFileSync(dest, "utf8")).toBe("hello-joi-download");
    expect(pcts.length).toBeGreaterThan(0);
  });

  it("follows redirects", async () => {
    const dest = path.join(tmpDir, "redir.bin");
    await downloadFile(`${baseUrl}/redirect`, dest, undefined, 5000);
    expect(readFileSync(dest, "utf8")).toBe("hello-joi-download");
  });

  it("rejects on HTTP error", async () => {
    const dest = path.join(tmpDir, "missing.bin");
    await expect(
      downloadFile(`${baseUrl}/missing`, dest, undefined, 5000),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("rejects when the connection stalls instead of hanging forever", async () => {
    const dest = path.join(tmpDir, "stall.bin");
    await expect(
      downloadFile(`${baseUrl}/stall`, dest, undefined, 400),
    ).rejects.toThrow(/зависла/);
  });
});
