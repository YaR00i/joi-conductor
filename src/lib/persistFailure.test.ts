import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";

installLocalStorageMock();

import { emptyAchievements } from "./achievements";
import { deleteGelbooruList } from "./gelbooruLists";
import {
  reportPersistFailure,
  subscribePersistFailure,
} from "./persistFailure";
import { emptyWallet, saveWallet } from "./wallet";
import { saveAchievements } from "./achievements";

function makeStorageThrow(): void {
  localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
}

beforeEach(() => {
  resetLocalStorage();
});

describe("subscribePersistFailure", () => {
  it("delivers reports and stops after unsubscribe", () => {
    const seen: string[] = [];
    const unsubscribe = subscribePersistFailure((message) =>
      seen.push(message),
    );
    reportPersistFailure("тест");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("тест");
    unsubscribe();
    reportPersistFailure("после отписки");
    expect(seen).toHaveLength(1);
  });
});

describe("savers report quota failures instead of throwing", () => {
  it("saveWallet survives a throwing storage and notifies", () => {
    const seen: string[] = [];
    const unsubscribe = subscribePersistFailure((m) => seen.push(m));
    makeStorageThrow();
    expect(() => saveWallet(emptyWallet())).not.toThrow();
    expect(seen[0]).toContain("кошелёк");
    unsubscribe();
  });

  it("saveAchievements reports on quota", () => {
    const seen: string[] = [];
    const unsubscribe = subscribePersistFailure((m) => seen.push(m));
    makeStorageThrow();
    expect(() => saveAchievements(emptyAchievements())).not.toThrow();
    expect(seen[0]).toContain("достижений");
    unsubscribe();
  });

  it("gelbooru list delete no longer throws from a click handler", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribePersistFailure((m) => seen.push(m));
    makeStorageThrow();
    await expect(deleteGelbooruList("list_1")).resolves.toBeUndefined();
    expect(seen[0]).toContain("Gelbooru");
    unsubscribe();
  });
});
