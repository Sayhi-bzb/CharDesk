# @chardesk/cell-ui

React Cell UI runtime. Its root entry is headless; the `/browser` entry projects the same committed frame to Canvas2D and Semantic DOM.

`runtime.setTheme(overrides)` replaces theme overrides for the next render; `undefined` restores defaults. Theme-only commits repaint the full buffer while reusing layout and scene. `CellSurface` retains its runtime across theme and viewport changes, preserving monotonic revisions, and repaints when fonts finish loading.

Collection focus uses one background-and-bold style across pointer, keyboard, and semantic input. `focusedSurfaceStyle` supplies the unselected focus background; `selectedStyle` preserves selection colors; `focusedItemStyle` supplies the accent for all focused collection items. Editors keep their caret/selection styling without this accent. Headless `render(..., { focusVisible: false })` remains an explicit host override; `CellSurface` does not toggle it by input modality.

## Theme consumption

`resolveCellStateStyle(local, state, theme)` owns state-style priority; `resolveCellTextStyle(base, state, theme)` adds text selection and composition. Painter supplies geometry and state, not color policy. `surfaceStyle` supplies Overlay backgrounds, `borderStyle` supplies border styling, and `caretColor` / `rangeSelectionColor` configure browser overlays. `background` / `foreground` supply the Canvas palette unless `CellSurface.palette` is explicitly provided. The private experimental API uses `focusedItemStyle` in place of `focusedSelectedStyle`, with no compatibility alias.

The `/browser` entry exports `readCellCssTheme(element)` and `useCellCssTheme(ref, revision)`, returning `{ theme, palette }`. The hook reads after mount and whenever the explicit string/number revision changes. Apply CSS changes before its layout effect; external stylesheet edits require a revision bump. No DOM mutation observer, per-frame CSS read, or DOM-per-Cell is created. Missing/invalid fields use `DEFAULT_CELL_UI_THEME`; development builds report the token name.

Supported color tokens (prefix each with `--cell-`): `background`, `foreground`, `surface`, `highlight`, `highlight-foreground`, `muted-foreground`, `border`, `selection`, `selection-foreground`, `range-selection`, `caret`, `scrollbar-thumb`. Browser CSS resolves inherited values and aliases; the adapter resolves colors before Canvas consumes them. `highlight` feeds both focus and selection; bold distinguishes focus. `--cell-accent` is consumed directly by host CSS for links and focus outlines, not by the headless engine.

```tsx
const container = useRef<HTMLDivElement>(null);
const { theme, palette } = useCellCssTheme(container, themeRevision);
return <div ref={container}>
  <CellSurface theme={theme} palette={palette} {...surfaceProps} />
</div>;
```

Gallery color values live only in [its CSS](../../exp/web-tui/styles.css). Host tokens can be aliased, e.g. `--cell-highlight: var(--accent)`. No Tailwind or shadcn dependency is required; the root engine continues accepting plain theme data without a browser.

```tsx
import {
  CellUiRuntime,
  captureCellProbe,
  formatCellProbe,
  List,
  ListItem,
  Root,
  ScrollArea,
  Text,
} from "@chardesk/cell-ui";

const runtime = new CellUiRuntime({ viewport: { width: 30, height: 9 } });
const frame = runtime.render(
  <Root id="root">
    <List style={{ height: 2 }}>
      <ListItem><Text>New file</Text></ListItem>
      <ListItem focused selected><Text>Open file</Text></ListItem>
    </List>
    <ScrollArea style={{ border: true, height: 6 }}>
      <List>
        <ListItem><Text>01  src/index.ts</Text></ListItem>
      </List>
    </ScrollArea>
  </Root>
);

console.log(formatCellProbe(captureCellProbe(frame), { header: true }));
runtime.dispose();
```

`Root`, `Box`, `Overlay`, `Text`, collection widgets, and text editors are descriptors consumed by `CellUiRuntime`; they are not DOM components. The collection set includes `List`, `Menu`, `Tree`, `Tabs`, and `Grid` with their item, row, and panel descriptors. Containers accept integer Cell layout through `style`. Explicit `id` values are globally stable; keyed children receive parent-scoped stable ids; unkeyed children follow React position identity.

Every `render()` is one commit and emits exactly one read-only `FrameSnapshot` through `onFrame`. The snapshot exposes reconciliation mutations, `WidgetTree`, `LayoutSnapshot`, `SceneSnapshot`, `CellBuffer`, `SemanticSnapshot`, and a phase/work/dirty-region invalidation report. Paint-only commits reuse Layout/Scene; geometry-only commits reuse Layout; unchanged commits reuse Buffer and skip present. Rendering `null` unmounts the tree and emits a blank frame. `CellUiRuntime` owns and disposes its injected `LayoutEngine`; the default `YogaLayoutEngine` uses `pointScaleFactor = 1` and retains Yoga Nodes by stable WidgetId until removal or disposal.

`TestPilot` is the browser-free interaction surface. It executes keyboard, Cell pointer/gesture, semantic action, scroll and resize input, then exposes the committed frame, Cell text, scene, hit, focus and role/name semantic queries. `probe()` returns the same serializable `CellProbeSnapshot` exposed by an inspectable browser Surface; `inspect(point)` diagnoses the rendered Cell, owner, Scene entry, hit stack and focus at one coordinate. `auditSemanticSnapshot()` validates names, traversal, bounds, focus, relationships and actions. `CELL_UI_PERFORMANCE_BUDGET` owns the executable scale, steady-scroll and raster thresholds.

Geometry distinguishes the root-relative border box, decoration box, and content box. Yoga exports per-edge border/padding Insets; SceneGeometry derives `decorationBounds`, `outerClip`, and `contentClip`. Painting is ordered Surface → Chrome → Content → Decoration, and decoration is clipped inside the border. Borders, padding, and Widget chrome are therefore protected from state fills, ordinary content, descendants, and focus/disclosure decoration. `Overlay` remains under its declaration parent for events and semantics, but portals to the root Scene layer at an integer Cell `position`; it does not inherit the declaration parent's clip.

`@chardesk/cell-ui/browser` owns `CellSurface`, Canvas DPR/resize presentation, px-to-Cell conversion, Semantic DOM, React Stately collection adapters, `useCellTextState`, and `useCellRangeState`. Text fields use a real transparent textarea for browser input and textbox semantics while Canvas renders the Cell projection. Semantic DOM emits `EngineInput.semantic`; keyboard, pointer, and accessibility channels converge through `commandForInput` before the single `WidgetCommand` callback. In keyboard/assistive mode, DOM focus follows the same logical `focusedId`, including across modal semantic-tree replacement; pointer mode retains Canvas focus behavior. A modal `Overlay` scopes focus and semantics; Escape or a pointer press outside emits one `dismiss` command, and unmount restores the prior focus target. The browser projection creates DOM per semantic widget, never per Cell. The runnable [Cell UI Gallery](../../exp/web-tui/) owns its [Core](../../exp/web-tui/#core), [Complex](../../exp/web-tui/#complex), [Editing](../../exp/web-tui/#editor), and [Overlay](../../exp/web-tui/#overlay) slices.

Text adapters must forward `text` commands, including `set-viewport`, to their
`CellTextEditor`. `CellSurface` and `TestPilot` derive that viewport from layout;
`useCellTextState` handles it automatically. Standalone editors can still specify
an initial viewport. `resolveWheelInput(frame, input)` reports `consumed`
separately from the optional scroll command. [Widget contracts](../../exp/blueprints/widgets.md)
own boundary, background, and editor sizing behavior.

## Cell inspection

`CellBuffer.writeGrapheme(..., clip, composition)` and `writeText(..., clip, maxWidth, composition)` accept `CellComposition`: default `"replace"` replaces the entire Cell; `"over"` preserves only an unspecified background from the destination. `clear()` always erases it. Scene painting uses `"over"`; [compositor contracts](../../exp/blueprints/compositor.md#行为契约) own layering and wide-Cell behavior.

`CellBuffer.toText()` is the single text-extraction authority used by Cell Range, probes, TestPilot, and browser `data-cell-text`. It owns region clipping, half-selected wide graphemes, and optional removal of empty ASCII padding; NBSP, ideographic space, combining sequences, emoji, and ZWJ graphemes remain data. `CellProbeSnapshot` is the character-level test oracle. Its `region`, `viewport`, and dense `cells` array retain exact dimensions, blank Cells, wide-grapheme continuation, owner, and style data. The snapshot is plain JSON with a versioned schema, so inline snapshots, test diffs and browser automation consume the same commit without reading Canvas pixels.

Set `probeId` only on development or test surfaces. The browser adapter then stores the latest snapshot on that Surface; `readCellSurfaceProbe(element)` retrieves it from the Surface or any descendant. Without `probeId`, no structured snapshot is created. `data-cell-text` remains the lightweight readable projection.

```tsx
<CellSurface probeId="editor" viewport={{ width: 40, height: 13 }} onCommand={dispatch}>
  {children}
</CellSurface>

const snapshot = readCellSurfaceProbe(document.querySelector('[data-cell-probe="editor"]')!);
console.log(snapshot?.text);
```

Use Cell probes for characters, borders, clipping, scrollbars and interaction results. Use screenshots only for font rasterization, color, DPR and other pixel presentation concerns.

`EventManager` routes Cell pointer input over `SceneSnapshot.eventParentId`: capture runs root-to-target, bubble runs target-to-root, and logical pointer capture survives movement outside hit bounds. `sync()` cancels capture when its owner is removed, hidden, or disabled. `GestureManager` is the deterministic tap/drag/scroll arena; an axis-matched winner receives start/update/end while every losing recognizer receives cancel. `CellSurface` uses this path for collection-item taps and drag scrolling.

`useCellMenuState`, `useCellTreeState`, `useCellTabsState`, and `useCellGridState` keep collection, focused, selection, expansion, and tab-panel state outside the renderer. Menu and Tree use vertical navigation; Tree Left/Right collapses, expands, enters children, and returns to parents; Tabs wrap horizontally with automatic selection; Grid uses row/column metadata for two-dimensional navigation. The same descriptor state produces Canvas paint and `menu`, `tree`, `tablist`, `tabpanel`, and `grid` semantics.

`FixedVirtualGrid` owns a fixed-Cell two-dimensional window: visible/cache ranges, stable row-key anchor, reveal alignment, bounded keepAlive, and content extent. It materializes only cached cells, including for 100k-row collections. `useCellVirtualListState` adapts its one-column projection to `List + ScrollArea`; the virtual content height and leading Cell padding preserve native SceneGeometry, hit testing, focus reveal, and scroll commands without mounting placeholder Widgets. PageUp/PageDown move focus by one visible page; wheel and drag preserve selection and move an offscreen focus to the nearest visible enabled row. Each projected `ListItem` carries its logical `positionInSet` and full `setSize`, so the bounded Semantic DOM still exposes the position and total through `aria-posinset` and `aria-setsize`. Runnable slice: [Gallery / Virtualization](../../exp/web-tui/#virtualization).

```tsx
const files = useCellVirtualListState(items, {
  scrollId: "files",
  viewportRows: 9,
  overscanRows: 2,
});

<ScrollArea id="files" scrollY={files.scrollY} style={{ border: true, height: 11 }}>
  <List style={{ height: files.totalHeight, paddingTop: files.paddingTop }}>
    {files.rows.map(({ item }) => (
      <ListItem id={item.id} key={item.id}><Text>{item.label}</Text></ListItem>
    ))}
  </List>
</ScrollArea>
```

```tsx
<Box id="clipped-parent">
  <Overlay
    id="palette"
    label="Command palette"
    position={{ x: 3, y: 2 }}
    style={{ border: true, width: 30, height: 7 }}
  >
    <List label="Commands">{items}</List>
  </Overlay>
</Box>
```

```tsx
const document = useCellTextState("document", {
  value: "Hello, 世界 👋",
  multiline: true,
  viewport: { columns: 36, rows: 5 },
});

<CellSurface onCommand={document.dispatch} viewport={{ width: 40, height: 7 }}>
  <Root id="root">
    <TextArea
      id="document"
      label="Document"
      state={document.snapshot}
      style={{ border: true, height: 7 }}
    />
  </Root>
</CellSurface>
```

Text editing uses UTF-16 document offsets internally and grapheme-safe Cell geometry externally. The current contract supports one primary selection, logical lines without soft wrap, grapheme left/right, line up/down, Home/End, Shift extension, Canvas click/drag, select-all, composition, paste/cut/copy, and undo/redo. Word/page movement, multi-selection, mobile input, and soft wrap are outside this contract.

Cell Range selects the final rendered projection, including borders and blank Cells. Drag with Option+Command on macOS or Alt on other platforms; copy writes the current rectangle as `text/plain`, preserving internal alignment and trimming only trailing spaces per row. Rectangle normalization computes a fixed point across all selected rows, so neither vertical edge can retain half of a wide grapheme after another row expands the bounds. `CellSurface` owns this state by default. Passing `cellRange` and `onCellRangeCommand` makes it controlled; `cellRange={null}` without a command handler disables selection. In uncontrolled mode, an optional command handler observes updates without taking ownership.

```tsx
const range = useCellRangeState();

<CellSurface
  cellRange={range.snapshot}
  onCellRangeCommand={range.dispatch}
  onCommand={dispatch}
  viewport={{ width: 40, height: 13 }}
>
  {children}
</CellSurface>
```

`range.snapshot?.text` is the same live text used by clipboard copy. `extractCellRange` and `normalizeCellRange` expose the headless Buffer operations.
