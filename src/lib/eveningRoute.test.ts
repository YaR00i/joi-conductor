import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  EVENING_ROUTE_STEPS,
  defaultEveningRouteState,
  eveningRouteStepMeta,
  loadEveningRouteState,
  markEveningRouteCompleted,
  markEveningRouteDismissed,
  reopenEveningRoute,
  saveEveningRouteState,
  shouldShowEveningRoute,
  EVENING_ROUTE_STORAGE_KEY,
} from "./eveningRoute";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("eveningRoute", () => {
  it("defaults to pending when storage is empty", () => {
    expect(loadEveningRouteState()).toEqual(defaultEveningRouteState());
    expect(shouldShowEveningRoute()).toBe(true);
  });

  it("hides after completed or dismissed", () => {
    markEveningRouteCompleted();
    expect(shouldShowEveningRoute()).toBe(false);
    expect(loadEveningRouteState().status).toBe("completed");

    markEveningRouteDismissed();
    expect(shouldShowEveningRoute()).toBe(false);
    expect(loadEveningRouteState().status).toBe("dismissed");
  });

  it("reopen from Settings resets to pending", () => {
    markEveningRouteDismissed();
    reopenEveningRoute();
    expect(loadEveningRouteState().status).toBe("pending");
    expect(shouldShowEveningRoute()).toBe(true);
  });

  it("tolerates corrupt JSON", () => {
    localStorage.setItem(EVENING_ROUTE_STORAGE_KEY, "{not-json");
    expect(loadEveningRouteState()).toEqual({ status: "pending" });
    expect(shouldShowEveningRoute()).toBe(true);
  });

  it("tolerates unknown status values", () => {
    saveEveningRouteState({ status: "pending" });
    localStorage.setItem(
      EVENING_ROUTE_STORAGE_KEY,
      JSON.stringify({ status: "wat" }),
    );
    expect(loadEveningRouteState()).toEqual({ status: "pending" });
  });

  it("exposes three RU steps", () => {
    expect(EVENING_ROUTE_STEPS).toHaveLength(3);
    expect(eveningRouteStepMeta(1).labelRu).toBe("Госпожа");
    expect(eveningRouteStepMeta(2).labelRu).toBe("Сегодня");
    expect(eveningRouteStepMeta(3).labelRu).toBe("Рулетка");
  });
});
