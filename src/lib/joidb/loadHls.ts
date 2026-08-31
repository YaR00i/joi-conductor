type HlsInstance = {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
};

export interface HlsApi {
  isSupported: () => boolean;
  new (config?: {
    xhrSetup?: (xhr: XMLHttpRequest, url: string) => void;
  }): HlsInstance;
}

declare global {
  interface Window {
    Hls?: HlsApi;
  }
}

/** Vendored UMD build in public/vendor (npm registry timed out on install). */
const HLS_SRC = "/vendor/hls.min.js";

export function loadHlsApi(signal?: AbortSignal): Promise<HlsApi> {
  if (window.Hls) return Promise.resolve(window.Hls);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const script = document.createElement("script");
    script.src = HLS_SRC;
    script.async = true;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      script.remove();
      reject(new Error("hls.js failed to load"));
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      script.remove();
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    script.addEventListener("error", fail, { once: true });
    script.addEventListener(
      "load",
      () => {
        if (settled) return;
        if (window.Hls) {
          settled = true;
          resolve(window.Hls);
          return;
        }
        fail();
      },
      { once: true },
    );
    document.head.appendChild(script);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
