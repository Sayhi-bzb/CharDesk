import { describe, expect, it } from "vitest";
import { HOST_ICONOLOGY } from "./iconology";

describe("host iconology", () => {
  it("maps the GitHub star statistic icon", () => {
    expect(HOST_ICONOLOGY.appMenu.githubStar).toBeDefined();
    expect(HOST_ICONOLOGY.sessionAction.import).toBeDefined();
    expect(HOST_ICONOLOGY.sessionAction.export).toBeDefined();
    expect(HOST_ICONOLOGY.appMenu.help).toBeDefined();
  });

  it("maps the supported canvas modes", () => {
    expect(HOST_ICONOLOGY.canvasMode.freeform).toBeDefined();
    expect(Object.keys(HOST_ICONOLOGY.canvasMode)).toEqual([
      "freeform",
      "slide",
      "ai",
    ]);
    expect(HOST_ICONOLOGY.sourceKind.blackboard).toBeDefined();
    expect(Object.keys(HOST_ICONOLOGY.slideAction)).toEqual([
      "play",
      "previous",
      "next",
      "close",
      "configure",
    ]);
    expect(HOST_ICONOLOGY.appMenu.shortcuts).toBeDefined();
    expect(HOST_ICONOLOGY.appMenu.settings).toBeDefined();
  });
});
