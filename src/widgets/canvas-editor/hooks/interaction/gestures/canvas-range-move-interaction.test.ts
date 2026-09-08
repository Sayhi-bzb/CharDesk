import { describe, expect, it } from "vitest";
import { updateRangeMoveInteraction } from "./rangeMoveInteraction";

describe("range move interaction", () => {
  it("keeps a press pending below the drag threshold", () => {
    const result = updateRangeMoveInteraction({
      state: {
        type: "rangeMovePending",
        anchor: { x: 1, y: 2 },
        current: { x: 1, y: 2 },
        accumulated: { x: 0, y: 0 },
      },
      eventDelta: { x: 3, y: 1 },
      currentGrid: { x: 1, y: 2 },
    });
    expect(result.preview).toBe(false);
    expect(result.state.type).toBe("rangeMovePending");
  });

  it("transitions to moving and continues accumulating pointer travel", () => {
    const started = updateRangeMoveInteraction({
      state: {
        type: "rangeMovePending",
        anchor: { x: 1, y: 2 },
        current: { x: 1, y: 2 },
        accumulated: { x: 3, y: 0 },
      },
      eventDelta: { x: 2, y: 0 },
      currentGrid: { x: 2, y: 2 },
    });
    expect(started).toEqual({
      preview: true,
      state: {
        type: "movingRange",
        anchor: { x: 1, y: 2 },
        current: { x: 2, y: 2 },
        accumulated: { x: 5, y: 0 },
      },
    });

    const continued = updateRangeMoveInteraction({
      state: started.state,
      eventDelta: { x: -1, y: 2 },
      currentGrid: { x: 2, y: 3 },
    });
    expect(continued.state).toMatchObject({
      type: "movingRange",
      current: { x: 2, y: 3 },
      accumulated: { x: 4, y: 2 },
    });
  });
});
