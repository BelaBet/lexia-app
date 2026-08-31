import { describe, expect, it } from "vitest";
import { GUIDE_FLOWS } from "./guideExamples";

const EXPECTED_STAGES = ["input", "summary", "document", "review"];

describe("guideExamples", () => {
  it("defines both flows (chat and pdf-reader)", () => {
    const ids = GUIDE_FLOWS.map((flow) => flow.id);
    expect(ids).toEqual(expect.arrayContaining(["chat", "pdf-reader"]));
  });

  it("has all four stages, in order, for every flow", () => {
    for (const flow of GUIDE_FLOWS) {
      expect(flow.stages.map((s) => s.stage)).toEqual(EXPECTED_STAGES);
    }
  });

  it("has a non-empty example prompt and response for every stage", () => {
    for (const flow of GUIDE_FLOWS) {
      for (const stage of flow.stages) {
        expect(stage.userPrompt.trim().length).toBeGreaterThan(0);
        expect(stage.aiResponse.trim().length).toBeGreaterThan(0);
        expect(stage.stageLabel.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
