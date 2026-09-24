# Introduction

Build React interfaces from editable Unicode Cells. Own the source, compose a few good defaults, and let one frame serve people and agents.

## Why Cells?

A border, a space, a label, and a cursor all occupy integer Cells. The same committed frame drives the visible Canvas, accessible controls, copyable Unicode, and headless tests. Cell UI ships as source you can change, with fewer built-in knobs to work around. Try Cell Range: hold Option (⌥) + Command (⌘) and drag on macOS, or Alt and drag on Windows/Linux. Copy preserves the selected Unicode, including border glyphs.

[Read the philosophy](https://ui.chardesk.com/#/guides/philosophy)

## Compose a settings panel

Theme and Sound are ordinary app state. Select and Checkbox share the same Cell grid and input model; try the menu and the checkbox with pointer or keyboard.

```tsx
const themeItems = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];
const theme = useCellSelectState("theme", themeItems, { defaultSelectedId: "dark" });
const [sound, setSound] = useState(true);

// Pass app-owned state into Select and Checkbox inside one Root.
```

[Select component](https://ui.chardesk.com/#/components/select)

## Show progress in text

The outline, fill, and empty track are Unicode Cells, not a painted approximation. Start an upload and watch it advance in uneven steps.

```tsx
const [progress, setProgress] = useState(0); // Your task updates this value.

<Root>
  <Text>Uploading files</Text>
  <Progress
    id="upload"
    label="Upload"
    value={progress}
    variant="outline"
    style={{ width: 26 }}
  />
  <Button id="start">
    <Text>Start</Text>
  </Button>
</Root>;
```

[Progress component](https://ui.chardesk.com/#/components/progress)

## Edit Unicode in place

Type into the note. Text editing uses the browser's native input path while the committed frame keeps the same Cell geometry and Unicode source.

```tsx
const note = useCellTextState("note", { value: "Hello, 世界 👋", multiline: true });

<CellSurface viewport={{ width: 32, height: 7 }} onCommand={note.dispatch}>
  <Root>
    <TextArea id="note" label="Notes" state={note.snapshot} />
  </Root>
</CellSurface>;
```

[TextArea component](https://ui.chardesk.com/#/components/text-area)

## Make it yours

Install the complete library into your project, then edit the source directly. Use the component pages for full wiring and public props; keep product-specific choices in your own code.

[Installation](https://ui.chardesk.com/#/guides/installation)
