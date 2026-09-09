import { describe, expect, it } from "vitest";
import {
  ActivationFeedbackManager,
  Button,
  CellUiRuntime,
  Checkbox,
  Root,
  Select,
  SelectTrigger,
  Text,
} from "./index.js";

const controls = () => (
  <Root id="root" style={{ direction: "column" }}>
    <Button id="save"><Text>Save</Text></Button>
    <Select id="theme" label="Theme">
      <SelectTrigger id="theme-trigger"><Text>Dark</Text></SelectTrigger>
    </Select>
    <Checkbox id="autosave" checked={false} />
  </Root>
);

describe("ActivationFeedbackManager", () => {
  it("accepts completed control commands and ignores unrelated commands", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 3 } });
    const frame = runtime.render(controls());
    const feedback = new ActivationFeedbackManager();

    expect(feedback.start(frame, { type: "focus", targetId: "save" })).toBeNull();
    expect(feedback.start(frame, { type: "activate", targetId: "save" })).toBe("save");
    expect(feedback.activeId).toBe("save");
    expect(feedback.start(frame, {
      type: "set-expanded",
      targetId: "theme-trigger",
      expanded: true,
    })).toBe("theme-trigger");
    expect(feedback.activeId).toBe("theme-trigger");
    expect(feedback.clear()).toBe(true);
    expect(feedback.activeId).toBeNull();
    const disabled = runtime.render(
      <Root id="root"><Button id="save" disabled><Text>Save</Text></Button></Root>
    );
    expect(feedback.start(disabled, { type: "activate", targetId: "save" })).toBeNull();
    runtime.dispose();
  });

  it("clears feedback when its target becomes disabled or unmounted", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 3 } });
    const frame = runtime.render(controls());
    const feedback = new ActivationFeedbackManager();
    feedback.start(frame, { type: "activate", targetId: "save" });

    const disabled = runtime.render(
      <Root id="root"><Button id="save" disabled><Text>Save</Text></Button></Root>
    );
    expect(feedback.sync(disabled)).toBe(true);
    expect(feedback.activeId).toBeNull();
    runtime.dispose();
  });
});

describe("activationFlash paint", () => {
  it("inverts the complete rectangle without changing layout or semantics", () => {
    const cases = [
      ["save", <Button id="save"><Text>Save</Text></Button>],
      ["theme-trigger", (
        <Select id="theme" label="Theme">
          <SelectTrigger id="theme-trigger"><Text>Dark</Text></SelectTrigger>
        </Select>
      )],
      ["autosave", <Checkbox id="autosave" checked={false} />],
    ] as const;

    for (const [id, control] of cases) {
      const runtime = new CellUiRuntime({ viewport: { width: 30, height: 1 } });
      const view = <Root id="root">{control}</Root>;
      const resting = runtime.render(view);
      const flashed = runtime.render(view, { activationFlashId: id });
      const rect = flashed.layout.entries.get(id)!.rect;

      expect(flashed.tree.nodes.get(id)?.activationFlash).toBe(true);
      expect(flashed.layout).toBe(resting.layout);
      expect(flashed.semantics.nodes).toBe(resting.semantics.nodes);
      expect(flashed.invalidation.phases).toEqual(["paint", "present"]);
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        expect(flashed.buffer.get(x, rect.y)?.style, `${id}:${x}`).toMatchObject({
          color: resting.buffer.get(x, rect.y)?.style.backgroundColor ?? "#101419",
          backgroundColor: resting.buffer.get(x, rect.y)?.style.color ?? "#e8edf2",
        });
      }
      runtime.dispose();
    }
  });
});
