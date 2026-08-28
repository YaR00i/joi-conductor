import { describe, expect, it } from "vitest";
import { fitDoujinGrid, apiWindowForGridPage, gridPageCount, LIBRARY_GRID_MAX_COLS, windowListItems } from "./fitGrid";

describe("fitDoujinGrid", () => {
  it("uses fewer larger columns on a wide pane", () => {
    const fit = fitDoujinGrid(1200, 820);
    expect(fit.cols).toBeGreaterThanOrEqual(3);
    expect(fit.cols).toBeLessThanOrEqual(5);
    expect(fit.pageSize).toBe(fit.cols * fit.rows);
    expect(fit.pageSize).toBeLessThan(25);
  });

  it("fills a complete rectangle", () => {
    const fit = fitDoujinGrid(900, 640);
    expect(fit.rows).toBeGreaterThanOrEqual(2);
    expect(fit.pageSize).toBe(fit.cols * fit.rows);
  });

  it("caps library columns so a tag rail can take a 5×2 page down to 8 cards", () => {
    const full = fitDoujinGrid(1600, 520);
    expect(full.cols).toBe(5);
    expect(full.rows).toBe(2);
    expect(full.pageSize).toBe(10);
    const library = fitDoujinGrid(1600, 520, { maxCols: LIBRARY_GRID_MAX_COLS });
    expect(library.cols).toBe(4);
    expect(library.rows).toBe(2);
    expect(library.pageSize).toBe(8);
  });

  it("windows a 25-item API page onto a 15-cell grid", () => {
    expect(apiWindowForGridPage(1, 15, 25)).toEqual({ apiPage: 1, offset: 0 });
    expect(apiWindowForGridPage(2, 15, 25)).toEqual({ apiPage: 1, offset: 15 });
    expect(apiWindowForGridPage(3, 15, 25)).toEqual({ apiPage: 2, offset: 5 });
    expect(gridPageCount(250, 15)).toBe(17);
    expect(windowListItems([1, 2, 3, 4, 5], 3, 4, [10, 11, 12])).toEqual([
      4, 5, 10, 11,
    ]);
  });
});
