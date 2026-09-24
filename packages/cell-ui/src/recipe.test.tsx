import { describe, expect, it } from "vitest";
import {
  Box,
  Button,
  CellTextEditor,
  CellUiRuntime,
  Combobox,
  ComboboxInput,
  Dialog,
  Progress,
  Root,
  ScrollArea,
  Select,
  SelectTrigger,
  Text,
  TextArea,
  TextInput,
  createWidgetDescriptor,
  type CellUiRecipe,
  type WidgetDescriptor,
} from "./index.js";
import { Overlay } from "./react.js";

const editor = new CellTextEditor({ value: "Text" });

const view = (explicit = false) => <Root id="root">
  <Box id="box" variant={explicit ? "ghost" : undefined} />
  <Button id="button" variant={explicit ? "solid" : undefined}><Text>Save</Text></Button>
  <Progress id="progress" label="Upload" value={50} variant={explicit ? "outline" : undefined} />
  <Select id="select" variant={explicit ? "ghost" : undefined}>
    <SelectTrigger id="select-trigger"><Text>Choice</Text></SelectTrigger>
  </Select>
  <Combobox id="combobox" variant={explicit ? "ghost" : undefined}>
    <ComboboxInput id="combobox-input" state={editor.snapshot()} />
  </Combobox>
  <TextInput id="text-input" variant={explicit ? "ghost" : undefined} state={editor.snapshot()} />
  <TextArea id="text-area" variant={explicit ? "ghost" : undefined} state={editor.snapshot()} />
  <ScrollArea id="scroll-area" variant={explicit ? "ghost" : undefined} />
  <Overlay id="overlay" variant={explicit ? "ghost" : undefined} position={{ x: 0, y: 0 }} />
  <Dialog id="dialog" variant={explicit ? "ghost" : undefined} />
</Root>;

const descriptorsById = (recipe?: CellUiRecipe, explicit = false) => {
  const root = createWidgetDescriptor(view(explicit), recipe)!;
  const entries: [string, WidgetDescriptor][] = [];
  const visit = (node: WidgetDescriptor) => {
    if (node.explicitId) entries.push([node.explicitId, node]);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return new Map(entries);
};

const surfaceIds = [
  "box",
  "select",
  "combobox",
  "text-input",
  "text-area",
  "scroll-area",
  "overlay",
  "dialog",
] as const;
const controlIds = ["select", "combobox", "text-input"] as const;
const containerIds = ["box", "text-area", "scroll-area", "overlay", "dialog"] as const;
const containerDefaults = {
  box: "ghost",
  "text-area": "ghost",
  "scroll-area": "ghost",
  overlay: "surface",
  dialog: "surface",
} as const;

describe("CellUiRecipe", () => {
  it("preserves component defaults when no global variant is configured", () => {
    const nodes = descriptorsById();
    expect(nodes.get("button")?.buttonVariant).toBe("solid");
    expect(nodes.get("progress")?.progressVariant).toBe("solid");
    expect(nodes.get("progress")?.surfaceVariant).toBeNull();
    expect(Object.fromEntries(surfaceIds.map((id) => [id, nodes.get(id)?.surfaceVariant])))
      .toEqual({
        box: "ghost",
        select: "surface",
        combobox: "surface",
        "text-input": "surface",
        "text-area": "ghost",
        "scroll-area": "ghost",
        overlay: "surface",
        dialog: "surface",
      });
  });

  for (const defaultControlVariant of ["surface", "ghost"] as const) {
    it(`applies global ${defaultControlVariant} only to controls`, () => {
      const nodes = descriptorsById({ defaultControlVariant });
      expect(nodes.get("button")?.buttonVariant).toBe(defaultControlVariant);
      expect(nodes.get("progress")?.progressVariant).toBe("solid");
      expect(nodes.get("progress")?.surfaceVariant).toBeNull();
      for (const id of controlIds) {
        expect(nodes.get(id)?.surfaceVariant).toBe(defaultControlVariant);
      }
      expect(Object.fromEntries(containerIds.map((id) => [id, nodes.get(id)?.surfaceVariant])))
        .toEqual(containerDefaults);
    });
  }

  it("keeps explicit component variants above the global default", () => {
    const nodes = descriptorsById({ defaultControlVariant: "surface" }, true);
    expect(nodes.get("button")?.buttonVariant).toBe("solid");
    expect(nodes.get("progress")?.progressVariant).toBe("outline");
    expect(nodes.get("progress")?.surfaceVariant).toBeNull();
    for (const id of surfaceIds) expect(nodes.get(id)?.surfaceVariant).toBe("ghost");
    const outlined = createWidgetDescriptor(
      <Root><Button id="outlined" variant="outline"><Text>More</Text></Button></Root>,
      { defaultControlVariant: "surface" },
    );
    expect(outlined?.children[0]?.buttonVariant).toBe("outline");
  });

  it("re-resolves omitted variants after a Runtime recipe update", () => {
    const runtime = new CellUiRuntime({
      viewport: { width: 20, height: 2 },
      recipe: { defaultControlVariant: "surface" },
    });
    const element = <Root>
      <Button id="button"><Text>Save</Text></Button>
      <Progress id="progress" label="Upload" value={50} />
      <Box id="layout"><Text>Layout</Text></Box>
      <Select id="select"><SelectTrigger id="select-trigger"><Text>Choice</Text></SelectTrigger></Select>
    </Root>;
    const surface = runtime.render(element);
    expect(surface.tree.nodes.get("button")?.buttonVariant).toBe("surface");
    expect(surface.tree.nodes.get("progress")?.progressVariant).toBe("solid");
    expect(surface.tree.nodes.get("layout")?.surfaceVariant).toBe("ghost");
    expect(surface.tree.nodes.get("select")?.surfaceVariant).toBe("surface");
    runtime.setRecipe({ defaultControlVariant: "ghost" });
    const ghost = runtime.render(element);
    expect(ghost.tree.nodes.get("button")?.buttonVariant).toBe("ghost");
    expect(ghost.tree.nodes.get("progress")?.progressVariant).toBe("solid");
    expect(ghost.tree.nodes.get("layout")?.surfaceVariant).toBe("ghost");
    expect(ghost.tree.nodes.get("select")?.surfaceVariant).toBe("ghost");
    runtime.dispose();
  });
});
