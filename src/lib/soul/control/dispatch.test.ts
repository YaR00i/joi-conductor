import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../../test/localStorageMock";
import { setActiveMistress } from "../../mistress/activeMistress";
import { smoothnessDue } from "./morning";
import { loadControlState } from "./store";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

describe("morning smoothness", () => {
  it("treats missing lastShavedAt as due", () => {
    const state = loadControlState("hu_tao");
    expect(smoothnessDue({ ...state, lastShavedAtMs: null })).toBe(true);
    expect(smoothnessDue({ ...state, lastShavedAtMs: Date.now() })).toBe(false);
  });
});
