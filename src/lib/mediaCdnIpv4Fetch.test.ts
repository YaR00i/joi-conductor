import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchMediaCdnIpv4,
  mediaCdnReferer,
  mediaCdnRequestHeaders,
} from "./mediaCdnIpv4Fetch";

let server: Server | null = null;

afterEach(async () => {
  const s = server;
  server = null;
  if (!s) return;
  s.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => {
    s.close((err) => (err ? reject(err) : resolve()));
  });
});

function listen(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!server) {
      reject(new Error("no server"));
      return;
    }
    server.listen(0, "127.0.0.1", () => {
      const addr = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

describe("mediaCdnReferer", () => {
  it("uses the site origin for the four new booru CDNs, not gelbooru", () => {
    expect(
      mediaCdnReferer(
        "https://img.xbooru.com/images/148/abfd08e934789ae172823aa00eab2217.png",
      ),
    ).toBe("https://xbooru.com/");
    expect(
      mediaCdnReferer("https://hypnohub.net/images/7b/99/abc.png"),
    ).toBe("https://hypnohub.net/");
    expect(
      mediaCdnReferer("https://realbooru.com/images/24/35/abc.webm"),
    ).toBe("https://realbooru.com/");
    expect(
      mediaCdnReferer(
        "https://cdn-s.the-joi-database.com/videos/abc/seg.ts",
      ),
    ).toBe("https://www.the-joi-database.com/");
    expect(
      mediaCdnReferer(
        "https://img.booru.org/blacked//images/104/cde13a01.png",
      ),
    ).toBe("https://blacked.booru.org/");
    expect(
      mediaCdnReferer(
        "https://thumbs.booru.org/censored/thumbnails//9/thumbnail_abc.png",
      ),
    ).toBe("https://censored.booru.org/");
  });

  it("keeps gelbooru and nhentai on their own origins", () => {
    expect(mediaCdnReferer("https://img3.gelbooru.com/images/x.jpg")).toBe(
      "https://gelbooru.com/",
    );
    expect(mediaCdnReferer("https://i.nhentai.net/galleries/1/1.jpg")).toBe(
      "https://nhentai.net/",
    );
  });

  it("sends identity encoding so the proxy does not strip gzip", () => {
    const headers = mediaCdnRequestHeaders(
      "https://img.xbooru.com/images/148/a.png",
      "bytes=0-1",
    );
    expect(headers.Referer).toBe("https://xbooru.com/");
    expect(headers["Accept-Encoding"]).toBe("identity");
    expect(headers.Range).toBe("bytes=0-1");
  });
});

describe("fetchMediaCdnIpv4", () => {
  it("returns bytes from an IPv4 listener", async () => {
    server = createServer((req, res) => {
      expect(req.headers.referer).toBe("https://xbooru.com/");
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(Buffer.from([137, 80, 78, 71]));
    });
    const origin = await listen();
    const res = await fetchMediaCdnIpv4(`${origin}/file.png`, {
      headers: mediaCdnRequestHeaders(
        "https://img.xbooru.com/images/148/file.png",
      ),
    });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([137, 80, 78, 71]),
    );
  });

  it("follows a redirect on the same IPv4 path", async () => {
    server = createServer((req, res) => {
      if (req.url === "/from") {
        res.writeHead(302, { Location: "/to" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      res.end(Buffer.from([0xff, 0xd8]));
    });
    const origin = await listen();
    const res = await fetchMediaCdnIpv4(`${origin}/from`, { headers: {} });
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(2);
  });

  it("fails a silent CDN instead of hanging", async () => {
    server = createServer(() => {
      /* never write a response */
    });
    const origin = await listen();
    await expect(
      fetchMediaCdnIpv4(`${origin}/stuck.png`, {
        headers: {},
        timeoutMs: 150,
      }),
    ).rejects.toThrow(/timeout/i);
  });
});
