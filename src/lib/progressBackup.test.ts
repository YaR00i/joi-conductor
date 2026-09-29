import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  applyProgressBackupLocal,
  base64ToUint8,
  parseProgressBackup,
  PROGRESS_BACKUP_KIND,
  PROGRESS_BACKUP_VERSION,
  serializeProgressBackup,
  uint8ToBase64,
  validateProgressBackup,
  type ProgressBackupPayload,
} from "./progressBackup";
import {
  captureProgress,
  getActiveSaveSlot,
  loadSaveSlotsMeta,
  PROGRESS_STORAGE_KEYS,
} from "./saveSlots";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function samplePayload(
  partial?: Partial<ProgressBackupPayload>,
): ProgressBackupPayload {
  return {
    kind: PROGRESS_BACKUP_KIND,
    version: PROGRESS_BACKUP_VERSION,
    exportedAt: "2026-07-22T12:00:00.000Z",
    activeSlot: "live",
    progress: {
      "joi-cinders-v1": JSON.stringify({ balance: 42 }),
      "joi-active-mistress": "hu_tao",
      "joi-diary-v1": null,
    },
    extras: {
      "joi-diary-ate-patch-v1": "1",
    },
    parked: {
      sandbox: {
        "joi-cinders-v1": JSON.stringify({ balance: 99999 }),
        "joi-active-mistress": "sparkle",
      },
    },
    favorites: null,
    favoritesNote: "test",
    ...partial,
  };
}

describe("uint8ToBase64 / base64ToUint8", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const b64 = uint8ToBase64(bytes);
    expect(b64.length).toBeGreaterThan(0);
    expect([...base64ToUint8(b64)]).toEqual([...bytes]);
  });
});

describe("validateProgressBackup / parseProgressBackup", () => {
  it("accepts a valid payload", () => {
    const raw = serializeProgressBackup(samplePayload());
    const parsed = parseProgressBackup(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.kind).toBe(PROGRESS_BACKUP_KIND);
    expect(parsed.data.version).toBe(1);
    expect(parsed.data.activeSlot).toBe("live");
    expect(parsed.data.progress["joi-cinders-v1"]).toContain("42");
    expect(parsed.data.parked.sandbox?.["joi-active-mistress"]).toBe("sparkle");
    expect(parsed.data.extras["joi-diary-ate-patch-v1"]).toBe("1");
  });

  it("rejects bad JSON", () => {
    expect(parseProgressBackup("{").ok).toBe(false);
  });

  it("rejects wrong kind / version / slot", () => {
    expect(
      validateProgressBackup({
        ...samplePayload(),
        kind: "nope",
      }).ok,
    ).toBe(false);
    expect(
      validateProgressBackup({
        ...samplePayload(),
        version: 99,
      }).ok,
    ).toBe(false);
    expect(
      validateProgressBackup({
        ...samplePayload(),
        activeSlot: "other",
      }).ok,
    ).toBe(false);
  });

  it("normalizes favorites rows and drops junk", () => {
    const parsed = validateProgressBackup(
      samplePayload({
        favorites: [
          {
            id: "gb-1",
            kind: "image",
            mime: "image/jpeg",
            fileName: "a.jpg",
            savedAt: 1,
            blobBase64: uint8ToBase64(new Uint8Array([1, 2, 3])),
          },
          { id: "", kind: "image" } as never,
          null as never,
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.favorites).toHaveLength(1);
    expect(parsed.data.favorites?.[0]?.id).toBe("gb-1");
  });

  it("treats missing favorites as null (not applied)", () => {
    const { favorites: _f, ...rest } = samplePayload();
    const parsed = validateProgressBackup(rest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.favorites).toBeNull();
  });
});

describe("applyProgressBackupLocal", () => {
  it("replaces progress keys and slot meta without touching unrelated keys", () => {
    localStorage.setItem("joi-voice-settings-v1", '{"mode":"llm"}');
    localStorage.setItem("joi-cinders-v1", JSON.stringify({ balance: 1 }));
    localStorage.setItem("joi-active-mistress", "sparkle");

    const payload = samplePayload();
    applyProgressBackupLocal(payload);

    expect(localStorage.getItem("joi-cinders-v1")).toContain("42");
    expect(localStorage.getItem("joi-active-mistress")).toBe("hu_tao");
    expect(localStorage.getItem("joi-diary-v1")).toBeNull();
    expect(localStorage.getItem("joi-diary-ate-patch-v1")).toBe("1");
    expect(localStorage.getItem("joi-voice-settings-v1")).toBe('{"mode":"llm"}');
    expect(getActiveSaveSlot()).toBe("live");

    const meta = loadSaveSlotsMeta();
    expect(meta.parked.sandbox?.["joi-active-mistress"]).toBe("sparkle");
    expect(meta.parked.live?.["joi-cinders-v1"]).toContain("42");

    const snap = captureProgress();
    for (const key of PROGRESS_STORAGE_KEYS) {
      expect(key in snap).toBe(true);
    }
  });

  it("clears keys that are null in the backup", () => {
    localStorage.setItem("joi-contracts-v1", '{"dayKey":"x"}');
    applyProgressBackupLocal(
      samplePayload({
        progress: {
          "joi-cinders-v1": "{}",
          "joi-contracts-v1": null,
        },
      }),
    );
    expect(localStorage.getItem("joi-contracts-v1")).toBeNull();
  });

  it("imports an old backup without joi-contract-series-v1 and still swaps slots", () => {
    localStorage.setItem("joi-contract-series-v1", '{"version":1,"series":{}}');
    applyProgressBackupLocal(
      samplePayload({
        progress: {
          "joi-cinders-v1": "{}",
        },
      }),
    );
    expect(localStorage.getItem("joi-contract-series-v1")).toBeNull();
    expect(PROGRESS_STORAGE_KEYS).toContain("joi-contract-series-v1");
    expect(captureProgress()["joi-contract-series-v1"]).toBeNull();
  });
});
