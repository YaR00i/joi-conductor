import type { MediaKind } from "./media";
import {
  createStallTimer,
  mediaDownloadStallMs,
} from "./mediaDownloadStall";
import {
  MEDIA_RANGE_PART_COUNT,
  mediaRangeParts,
  parseContentRangeTotal,
  shouldUseRangedDownload,
} from "./mediaRangeParts";

type ProbeResult =
  | { type: "complete"; blob: Blob }
  | { type: "partial"; size: number }
  | { type: "unknown" };

type XhrResult = {
  blob: Blob;
  status: number;
  contentRange: string | null;
};

type XhrHandle = {
  abort: () => void;
  promise: Promise<XhrResult>;
};

function xhrGetBlob(opts: {
  url: string;
  range?: { start: number; end: number };
  kind?: MediaKind;
  onProgress: (loaded: number, total: number | null) => void;
}): XhrHandle {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", opts.url);
  xhr.responseType = "blob";
  xhr.timeout = 0;
  if (opts.range) {
    xhr.setRequestHeader(
      "Range",
      `bytes=${opts.range.start}-${opts.range.end}`,
    );
  }

  let settled = false;
  let stalled = false;
  const stall = createStallTimer({
    stallMs: mediaDownloadStallMs(opts.kind),
    onStall: () => {
      stalled = true;
      xhr.abort();
    },
  });

  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    stall.clear();
    fn();
  };

  const promise = new Promise<XhrResult>((resolve, reject) => {
    xhr.onprogress = (event) => {
      stall.ping();
      const total =
        event.lengthComputable && event.total > 0 ? event.total : null;
      opts.onProgress(event.loaded, total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        finish(() =>
          resolve({
            blob: xhr.response as Blob,
            status: xhr.status,
            contentRange: xhr.getResponseHeader("content-range"),
          }),
        );
        return;
      }
      finish(() => reject(new Error(`preload HTTP ${xhr.status}`)));
    };
    xhr.onerror = () =>
      finish(() => reject(new Error("preload network error")));
    xhr.ontimeout = () => finish(() => reject(new Error("preload timeout")));
    xhr.onabort = () =>
      finish(() =>
        reject(new Error(stalled ? "preload timeout" : "preload aborted")),
      );
    xhr.send();
  });

  return {
    abort: () => xhr.abort(),
    promise,
  };
}

async function probeRemoteSize(
  remote: string,
  kind?: MediaKind,
): Promise<ProbeResult> {
  try {
    const result = await xhrGetBlob({
      url: remote,
      range: { start: 0, end: 0 },
      kind,
      onProgress: () => undefined,
    }).promise;
    if (result.status === 206) {
      const size = parseContentRangeTotal(result.contentRange);
      if (size) return { type: "partial", size };
      return { type: "unknown" };
    }
    if (result.blob.size > 1) {
      return { type: "complete", blob: result.blob };
    }
    return { type: "unknown" };
  } catch {
    return { type: "unknown" };
  }
}

function downloadSingleXhr(
  remote: string,
  onProgress: (loaded: number, total: number | null) => void,
  kind?: MediaKind,
): Promise<Blob> {
  return xhrGetBlob({
    url: remote,
    kind,
    onProgress,
  }).promise.then((result) => result.blob);
}

async function downloadRangedBlob(
  remote: string,
  size: number,
  onProgress: (loaded: number, total: number | null) => void,
  kind?: MediaKind,
): Promise<Blob> {
  const parts = mediaRangeParts(size, MEDIA_RANGE_PART_COUNT);
  if (parts.length <= 1) {
    return downloadSingleXhr(remote, onProgress, kind);
  }

  const loaded = parts.map(() => 0);
  const handles: XhrHandle[] = [];

  const report = () => {
    onProgress(
      loaded.reduce((sum, n) => sum + n, 0),
      size,
    );
  };

  try {
    const chunks = await Promise.all(
      parts.map((part, index) => {
        const handle = xhrGetBlob({
          url: remote,
          range: part,
          kind,
          onProgress: (n) => {
            loaded[index] = n;
            report();
          },
        });
        handles.push(handle);
        return handle.promise.then((result) => {
          if (result.status !== 206) {
            throw new Error(`preload HTTP ${result.status}`);
          }
          loaded[index] = result.blob.size;
          report();
          return result.blob;
        });
      }),
    );
    const type = chunks.find((chunk) => chunk.type)?.type;
    return new Blob(chunks, type ? { type } : undefined);
  } catch (err) {
    for (const handle of handles) handle.abort();
    await Promise.all(
      handles.map((handle) => handle.promise.catch(() => undefined)),
    );
    throw err;
  }
}

export async function downloadMediaBlob(
  remote: string,
  onProgress: (loaded: number, total: number | null) => void,
  kind?: MediaKind,
): Promise<Blob> {
  if (kind !== "video" && kind !== "gif") {
    return downloadSingleXhr(remote, onProgress, kind);
  }
  const probed = await probeRemoteSize(remote, kind);
  if (probed.type === "complete") {
    onProgress(probed.blob.size, probed.blob.size);
    return probed.blob;
  }
  if (probed.type === "partial" && shouldUseRangedDownload(probed.size)) {
    try {
      return await downloadRangedBlob(remote, probed.size, onProgress, kind);
    } catch {
      return downloadSingleXhr(remote, onProgress, kind);
    }
  }
  return downloadSingleXhr(remote, onProgress, kind);
}
