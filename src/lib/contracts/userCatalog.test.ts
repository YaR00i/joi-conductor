import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  CONTRACT_CATALOG,
  getContractDef,
} from "./catalog";
import {
  contractEditorOrigin,
  duplicateToUserContract,
  getMergedContractCatalog,
  listEditorCatalog,
  restoreBuiltinOverride,
  upsertUserOverride,
} from "./userCatalog";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("contract editor catalog", () => {
  it("lists built-ins until an override replaces one id", () => {
    const before = listEditorCatalog();
    expect(before.length).toBe(CONTRACT_CATALOG.length);
    expect(before.every((r) => r.origin === "builtin")).toBe(true);

    const src = CONTRACT_CATALOG.find((d) => d.id === "role_journal");
    expect(src).toBeTruthy();
    upsertUserOverride({
      ...src!,
      nameRu: "Дневник слуги · правка",
      clonedFrom: "role_journal",
    });

    const after = listEditorCatalog();
    expect(after).toHaveLength(CONTRACT_CATALOG.length);
    const row = after.find((r) => r.id === "role_journal");
    expect(row?.origin).toBe("override");
    expect(row?.def.nameRu).toBe("Дневник слуги · правка");
    expect(getContractDef("role_journal")?.nameRu).toBe(
      "Дневник слуги · правка",
    );
    expect(
      getMergedContractCatalog().filter((d) => d.id === "role_journal"),
    ).toHaveLength(1);
  });

  it("restores a built-in after override", () => {
    const src = CONTRACT_CATALOG.find((d) => d.id === "life_bedtime_edge")!;
    upsertUserOverride({ ...src, nameRu: "tmp", clonedFrom: src.id });
    expect(contractEditorOrigin(src.id)).toBe("override");
    expect(restoreBuiltinOverride(src.id)).toBe(true);
    expect(contractEditorOrigin(src.id)).toBe("builtin");
    expect(getContractDef(src.id)?.nameRu).toBe(src.nameRu);
  });

  it("duplicates as a new user contract without replacing the original", () => {
    const src = CONTRACT_CATALOG.find((d) => d.id === "media_doujin")!;
    const copy = duplicateToUserContract(src);
    expect(copy.id.startsWith("user_")).toBe(true);
    expect(copy.clonedFrom).toBeUndefined();
    expect(getContractDef(src.id)?.nameRu).toBe(src.nameRu);
    expect(getContractDef(copy.id)?.nameRu).toContain("копия");
    expect(contractEditorOrigin(copy.id)).toBe("user");
  });
});
