import { describe, expect, it } from "vitest";
import {
  ActivationFeedbackManager,
  Button,
  CellUiRuntime,
  Checkbox,
  Root,
  Select,
  SelectContent,
  SelectItem,
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

const openSelect = () => (
  <Root id="root">
    <Select id="theme" label="Theme" style={{ width: 20 }}>
      <SelectTrigger id="theme-trigger" expanded controlsId="theme-content">
        <Text>Dark</Text>
      </SelectTrigger>
      <SelectContent id="theme-content">
        <SelectItem id="light"><Text>Light</Text></SelectItem>
        <SelectItem id="dark" selected><Text>Dark</Text></SelectItem>
      </SelectContent>
    </Select>
  </Root>
);

describe("ActivationFeedbackManager", () => {
  it("runs the configured number of hard inverse phases", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 3 } });
    const frame = runtime.render(controls());
    const feedback = new ActivationFeedbackManager();
    const activate = { type: "activate", targetId: "save" } as const;

    expect(feedback.start(frame, activate, 0)).toBeNull();
    expect(feedback.running).toBe(false);

    expect(feedback.start(frame, activate)).toBe("save");
    expect(feedback.activeId).toBe("save");
    expect(feedback.advance()).toBe(true);
    expect(feedback.activeId).toBeNull();
    expect(feedback.running).toBe(true);
    expect(feedback.advance()).toBe(true);
    expect(feedback.activeId).toBe("save");
    expect(feedback.advance()).toBe(true);
    expect(feedback.activeId).toBeNull();
    expect(feedback.running).toBe(false);

    expect(feedback.start(frame, activate, 3)).toBe("save");
    const phases = [feedback.activeId];
    while (feedback.running) {
      feedback.advance();
      phases.push(feedback.activeId);
    }
    expect(phases).toEqual(["save", null, "save", null, "save", null]);
    runtime.dispose();
  });

  it("accepts completed control commands and ignores unrelated commands", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 6 } });
    const frame = runtime.render(controls());
    const feedback = new ActivationFeedbackManager();

    expect(feedback.start(frame, { type: "focus", targetId: "save" })).toBeNull();
    expect(feedback.start(frame, { type: "activate", targetId: "save" })).toBe("save");
    expect(feedback.activeId).toBe("save");
    expect(feedback.start(frame, {
      type: "set-expanded",
      targetId: "theme-trigger",
      expanded: true,
    })).toBeNull();
    expect(feedback.activeId).toBeNull();

    const open = runtime.render(openSelect());
    expect(feedback.start(open, { type: "activate", targetId: "light" })).toBe("light");
    expect(feedback.activeId).toBe("light");
    expect(feedback.settling).toBe(true);
    feedback.advance();
    feedback.advance();
    feedback.advance();
    expect(feedback.takeCompletionCommand())
      .toEqual({ type: "dismiss", targetId: "theme-content" });
    expect(feedback.takeCompletionCommand()).toBeNull();
    expect(feedback.clear()).toBe(false);
    expect(feedback.activeId).toBeNull();
    expect(feedback.start(open, { type: "activate", targetId: "light" }, 0)).toBeNull();
    expect(feedback.running).toBe(false);
    expect(feedback.takeCompletionCommand())
      .toEqual({ type: "dismiss", targetId: "theme-content" });
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
      ["light", (
        <Select id="theme" label="Theme">
          <SelectTrigger id="theme-trigger" expanded controlsId="theme-content">
            <Text>Dark</Text>
          </SelectTrigger>
          <SelectContent id="theme-content">
            <SelectItem id="light"><Text>Light</Text></SelectItem>
          </SelectContent>
        </Select>
      )],
      ["autosave", <Checkbox id="autosave" checked={false} />],
    ] as const;

    for (const [id, control] of cases) {
      const runtime = new CellUiRuntime({ viewport: { width: 30, height: 5 } });
      const view = <Root id="root">{control}</Root>;
      const resting = runtime.render(view);
      const flashed = runtime.render(view, { activationFlashId: id });
      const rect = flashed.scene.entries.get(id)!.layoutBounds;

      expect(flashed.tree.nodes.get(id)?.activationFlash).toBe(true);
      expect(flashed.layout).toBe(resting.layout);
      expect(flashed.semantics.nodes).toBe(resting.semantics.nodes);
      expect(flashed.invalidation.phases).toEqual(["paint", "present"]);
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        expect(flashed.buffer.get(x, rect.y)?.style, `${id}:${x}`).toMatchObject({
          color: resting.buffer.get(x, rect.y)?.style.backgroundColor ?? "#FFFFFF",
          backgroundColor: resting.buffer.get(x, rect.y)?.style.color ?? "#000000",
        });
      }
      runtime.dispose();
    }
  });
});
