/**
 * Fetch ollama.com search HTML (no CORS in Electron).
 * Parsing happens in the renderer (`parseOllamaSearchHtml`).
 */
export async function fetchOllamaSearchHtml(query) {
  const q = String(query ?? "")
    .trim()
    .slice(0, 80);
  if (!q) return "";
  const url = `https://ollama.com/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "joi-conductor/ollama-search",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Библиотека Ollama HTTP ${res.status}`);
  }
  return res.text();
}
