import { describe, expect, it } from "vitest";
import { generateSeriesProgression } from "./seriesProgression";

describe("seriesProgression", () => {
  it("builds a 7-day smooth integer ramp inside catalog bounds", () => {
    const result = generateSeriesProgression({
      length: 7,
      contractDefId: "edge_count",
      key: "n",
      start: 3,
      end: 10,
      mode: "smooth",
    });
    expect(result.days).toHaveLength(7);
    const values = result.days.map((d) => d.paramOverrides?.n);
    expect(values[0]).toBe(3);
    expect(values[6]).toBe(10);
    expect(values.every((v) => typeof v === "number" && Number.isInteger(v))).toBe(
      true,
    );
    expect(values.every((v) => typeof v === "number" && v >= 3 && v <= 10)).toBe(
      true,
    );
    expect(result.days[0]?.intensity).toBe(1);
    expect(result.days[6]?.intensity).toBe(5);
  });

  it("builds 30 stepped days and clamps out-of-range without explicit override", () => {
    const result = generateSeriesProgression({
      length: 30,
      contractDefId: "edge_count",
      key: "n",
      start: 1,
      end: 20,
      mode: "steps",
    });
    expect(result.days).toHaveLength(30);
    const values = result.days.map((d) => d.paramOverrides?.n as number);
    expect(values.every((v) => v >= 3 && v <= 10)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    const plateaus = new Set(values);
    expect(plateaus.size).toBeLessThan(30);
  });
});
