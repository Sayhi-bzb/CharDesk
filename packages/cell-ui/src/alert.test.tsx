import { describe, expect, it } from "vitest";
import { Alert, AlertDescription, AlertTitle, Button, CellUiRuntime, Root, Text, createTestPilot, auditSemanticSnapshot } from "./index.js";
import { CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME } from "./theme.js";

describe("Alert", () => {
  it.each([CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME])("paints tones and borders in owned Cells", (theme) => {
    const runtime = new CellUiRuntime({ viewport: { width: 44, height: 8 }, theme });
    for (const [tone, glyph, role] of [
      ["info", "i", "status"], ["success", "✓", "status"],
      ["warning", "!", "alert"], ["error", "×", "alert"],
    ] as const) {
      for (const border of ["none", "square", "rounded"] as const) {
        const frame = runtime.render(<Root><Alert id="notice" tone={tone} border={border}>
          <AlertTitle>Changes saved</AlertTitle><AlertDescription>Available offline.</AlertDescription>
        </Alert></Root>);
        const bounds = frame.scene.entries.get("notice")!.layoutBounds;
        const corner = frame.buffer.get(bounds.x, bounds.y);
        expect(corner?.text).toBe(border === "square" ? "┌" : border === "rounded" ? "╭" : " ");
        if (border !== "none") expect(corner?.style.color).toBe(theme.badgeStyles[tone].color);
        expect(frame.buffer.get(bounds.x + (border === "none" ? 1 : 2), bounds.y + (border === "none" ? 1 : 2))?.text).toBe(glyph);
        expect(frame.buffer.get(bounds.x + 4, bounds.y + (border === "none" ? 1 : 2))?.style.backgroundColor)
          .toBe(theme.badgeStyles[tone].backgroundColor);
        expect(frame.semantics.nodes.get("notice")).toMatchObject({ role, actions: [] });
        expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
      }
    }
    runtime.dispose();
  });

  it("updates border color with tone without changing the global border token", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 44, height: 8 } });
    const view = (tone: "warning" | "success") => <Root><Alert id="notice" tone={tone} border="rounded">
      <AlertTitle>Changes</AlertTitle>
    </Alert></Root>;
    const warning = runtime.render(view("warning"));
    expect(warning.buffer.get(0, 0)?.style.color).toBe(CLASSIC_MAC_LIGHT_THEME.badgeStyles.warning.color);
    const success = runtime.render(view("success"));
    expect(success.buffer.get(0, 0)?.style.color).toBe(CLASSIC_MAC_LIGHT_THEME.badgeStyles.success.color);
    expect(success.buffer.get(0, 0)?.style.color).not.toBe(CLASSIC_MAC_LIGHT_THEME.borderStyle.color);
    runtime.dispose();
  });

  it("falls back to the global border color when a custom tone has no foreground", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 44, height: 8 }, theme: {
      badgeStyles: { ...CLASSIC_MAC_LIGHT_THEME.badgeStyles, warning: { backgroundColor: "#FFF0CC" } },
    } });
    const frame = runtime.render(<Root><Alert tone="warning" border="square"><AlertTitle>Warning</AlertTitle></Alert></Root>);
    expect(frame.buffer.get(0, 0)?.style.color).toBe(CLASSIC_MAC_LIGHT_THEME.borderStyle.color);
    runtime.dispose();
  });

  it("has no border when omitted, regardless of theme shape", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 44, height: 8 }, theme: { borderShape: "rounded" } });
    const frame = runtime.render(<Root><Alert id="notice"><AlertTitle>Ready</AlertTitle></Alert></Root>);
    const bounds = frame.scene.entries.get("notice")!.layoutBounds;
    expect(frame.buffer.get(bounds.x, bounds.y)?.text).toBe(" ");
    expect(frame.buffer.get(bounds.x + 1, bounds.y + 1)?.text).toBe("i");
    runtime.dispose();
  });

  it("protects its marker Cell from caller padding", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 7 } });
    const frame = runtime.render(<Root><Alert id="notice" border="none" style={{ paddingLeft: 0 }}>
      <AlertTitle>Ready</AlertTitle>
    </Alert></Root>);
    const bounds = frame.scene.entries.get("notice")!.layoutBounds;
    expect(frame.buffer.get(bounds.x + 1, bounds.y + 1)?.text).toBe("i");
    expect(frame.buffer.get(bounds.x + 3, bounds.y + 1)?.text).toBe("R");
    runtime.dispose();
  });

  it("moves the optional action below the description when width is narrow", () => {
    const render = (width: number) => {
      const runtime = new CellUiRuntime({ viewport: { width, height: 16 } });
      const frame = runtime.render(<Root><Alert id="notice" style={{ width }}>
        <AlertTitle>Unsaved changes</AlertTitle>
        <AlertDescription>Changes are stored locally.</AlertDescription>
        <Button id="save"><Text>Save now</Text></Button>
      </Alert></Root>);
      const button = frame.scene.entries.get("save")!.layoutBounds;
      const description = [...frame.tree.nodes.values()].find((node) => node.text === "Changes are stored locally.")!;
      const descriptionBounds = frame.scene.entries.get(description.id)!.layoutBounds;
      runtime.dispose();
      return { button, descriptionBounds };
    };
    expect(render(44).button.y).toBe(render(44).descriptionBounds.y);
    const narrow = render(20);
    expect(narrow.button.y).toBeGreaterThanOrEqual(narrow.descriptionBounds.y + narrow.descriptionBounds.height);
  });

  it("keeps the notice static while its optional Button activates", async () => {
    const commands: string[] = [];
    const pilot = createTestPilot({ viewport: { width: 44, height: 8 }, render: () => <Root>
      <Alert id="notice" tone="warning"><AlertTitle>Unsaved changes</AlertTitle>
        <AlertDescription>Changes are stored locally.</AlertDescription>
        <Button id="save"><Text>Save now</Text></Button>
      </Alert>
    </Root>, onCommand: (command) => { if (command.type === "activate") commands.push(command.targetId); } });
    expect(pilot.getByRole("alert", { name: /Unsaved changes/ }).actions).toEqual([]);
    expect(pilot.getByRole("button", { name: "Save now" }).semanticParentId).toBe("notice");
    await pilot.pressKey("Tab");
    expect(pilot.focus()).toBe("save");
    await pilot.pressKey("Enter");
    expect(commands).toEqual(["save"]);
    pilot.dispose();
  });

  it("requires a title and limits the optional content", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 44, height: 8 } });
    expect(() => runtime.render(<Root><Alert><AlertDescription>Only a description</AlertDescription></Alert></Root>))
      .toThrow(/Alert requires/);
    expect(() => runtime.render(<Root><Alert><AlertTitle> </AlertTitle></Alert></Root>))
      .toThrow(/Alert requires/);
    expect(() => runtime.render(<Root><Alert><AlertTitle>Title</AlertTitle>
      <Button id="save"><Text>Save</Text></Button><AlertDescription>Late description</AlertDescription>
    </Alert></Root>)).toThrow(/Alert requires/);
    runtime.dispose();
  });
});
