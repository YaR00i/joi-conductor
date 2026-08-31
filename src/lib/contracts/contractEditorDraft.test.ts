import { describe, expect, it } from "vitest";
import { draftFromContractDef, draftToContractPayload } from "./contractEditorDraft";
import { CONTRACT_CATALOG } from "./catalog";

describe("contractEditorDraft", () => {
  it("round-trips rolls and finish debrief", () => {
    const src = CONTRACT_CATALOG.find((d) => d.id === "media_faproulette_finish")!;
    const draft = draftFromContractDef(src);
    expect(draft.kind).toBe("finish_debrief");
    expect(draft.finishDebriefPreset).toBe("faproulette");
    expect(draft.rolls.n).toMatch(/\d/);
    const payload = draftToContractPayload(draft, []);
    expect(payload.id).toBe(src.id);
    expect(payload.kind).toBe("finish_debrief");
    expect(payload.finishDebriefPreset).toBe("faproulette");
    expect(payload.rolls?.n?.length).toBeGreaterThan(0);
  });
});
