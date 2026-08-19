/**
 * Client for the WD14 Python server (scripts/wd14_server.py).
 * Sends a base64-encoded image to POST /tag and returns booru tags.
 */

const DEFAULT_BASE = "http://127.0.0.1:7878";

/**
 * @param {{ baseUrl?: string, fileBytes: Buffer | Uint8Array, mime?: string, generalThreshold?: number, characterThreshold?: number, maxTags?: number }} opts
 * @returns {Promise<{ tags: string[], scores: { tag: string, score: number }[] }>}
 */
export async function tagImageViaServer(opts) {
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const bytes = Buffer.isBuffer(opts.fileBytes)
    ? opts.fileBytes
    : Buffer.from(opts.fileBytes);
  if (bytes.length === 0) throw new Error("WD14: пустое изображение");

  // Build multipart/form-data by hand (no extra deps).
  const boundary = `----joiWd14${Math.random().toString(16).slice(2)}`;
  const ext = (opts.mime || "image/png").split("/")[1] || "png";
  const filename = `img.${ext}`;
  const parts = [];

  const fieldPart = (name, value) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  parts.push(Buffer.from(fieldPart("general_threshold", String(opts.generalThreshold ?? 0.35)), "utf8"));
  parts.push(Buffer.from(fieldPart("character_threshold", String(opts.characterThreshold ?? 0.85)), "utf8"));
  parts.push(Buffer.from(fieldPart("max_tags", String(opts.maxTags ?? 60)), "utf8"));

  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${opts.mime || "image/png"}\r\n\r\n`,
    "utf8",
  );
  parts.push(fileHeader, bytes, Buffer.from("\r\n", "utf8"));
  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  const body = Buffer.concat(parts);

  const res = await fetch(`${base}/tag`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WD14 /tag HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) ?? {};
  const tags = Array.isArray(json.tags) ? json.tags.filter((t) => typeof t === "string") : [];
  const scores = Array.isArray(json.scores)
    ? json.scores
        .map((s) =>
          s && typeof s === "object" && typeof s.tag === "string" && typeof s.score === "number"
            ? { tag: s.tag, score: s.score }
            : null,
        )
        .filter(Boolean)
    : [];
  return { tags, scores };
}
