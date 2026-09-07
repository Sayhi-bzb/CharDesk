# @chardesk/cell-ui

React Cell UI runtime. Its root entry is headless; the `/browser` entry projects the same committed frame to Canvas2D and Semantic DOM.

`createCellBufferSource()` exposes the committed dense buffer through the
storage-neutral `@chardesk/cell-core` contract. `createCellUiRenderFrame()` maps
that source to the same Canvas Presenter used by the document Canvas; Widget,
Scene, focus, gesture, semantics, and text-input state remain Cell UI concerns.

`runtime.setTheme(overrides)` replaces theme overrides for the next render; `undefined` restores defaults. Theme-only commits repaint the full buffer while reusing layout and scene. `CellSurface` retains its runtime across theme and viewport changes, preserving monotonic revisions, and repaints when fonts finish loading.

Collection focus uses one background-and-bold style across pointer, keyboard, and semantic input. `focusedSurfaceStyle` supplies the unselected focus background; `selectedStyle` preserves selection colors; `focusedItemStyle` supplies the accent for all focused collection items. Editors keep their caret/selection styling without this accent. Headless `render(..., { focusVisible: false })` remains an explicit host override; `CellSurface` does not toggle it by input modality.

## Theme consumption

`CellSurface` separates retained logical `focusedId` from browser focus ownership. It passes actual Surface/window activity through the runtime's existing `focusVisible` option; focus backgrounds, focus bold, Canvas caret, and `data-cell-focus-visible` follow that same state. Blur preserves selection and editing state. Internal DOM focus transfers retain activity; external/null-target blur and window changes recheck ownership before restoring focus. Headless defaults are unchanged.

`CellUiTheme.borderShape` accepts `"square"` (default) or `"rounded"` (`╭╮╰╯`). Both use the shared border painter and `borderStyle` / `--cell-border` color. Shape is paint-only; `style.border` still reserves one Cell per edge. Set shape through theme data, not CSS radius; rounded corners do not clip the rectangular background.

`render(..., { hoveredId })` supplies optional transient hover; omission clears it. `WidgetNode.hovered` affects paint only, not layout or semantic nodes. `hoveredItemStyle` / `--cell-hover` supplies collection hover backgrounds, skipped for focused, selected, or disabled items. `CellSurface` derives hover and cursor from Scene hits and modal scope, updates only when the resolved target changes, and rechecks stationary pointers on frame/scroll/resize changes. Hover is mouse-only; down/drag suspends it, up restores it, and leave/cancel/capture loss/window blur clears it. It never emits widget commands. Canvas cursor is pointer for actionable items, text for enabled editor content (including read-only), otherwise default.

`resolveCellStateStyle(local, state, theme)` owns state-style priority; `resolveCellTextStyle(base, state, theme)` adds text selection and composition. Painter supplies geometry and state, not color policy. `surfaceStyle` supplies Overlay backgrounds, `borderStyle` supplies border styling, and `caretColor` / `rangeSelectionColor` configure browser overlays. `background` / `foreground` supply the Canvas palette unless `CellSurface.palette` is explicitly provided. The private experimental API uses `focusedItemStyle` in place of `focusedSelectedStyle`, with no compatibility alias.

The `/browser` entry exports `readCellCssTheme(element)` and `useCellCssTheme(ref, revision)`, returning `{ theme, palette }`. The hook reads after mount and whenever the explicit string/number revision changes. Apply CSS changes before its layout effect; external stylesheet edits require a revision bump. No DOM mutation observer, per-frame CSS read, or DOM-per-Cell is created. Missing/invalid fields use `DEFAULT_CELL_UI_THEME`; development builds report the token name.

Supported color tokens (prefix each with `--cell-`): `background`, `foreground`, `surface`, `hover`, `highlight`, `highlight-foreground`, `muted-foreground`, `border`, `selection`, `selection-foreground`, `range-selection`, `caret`, `scrollbar-thumb`. Browser CSS resolves inherited values and aliases; the adapter resolves colors before Canvas consumes them. `highlight` feeds both focus and selection; bold distinguishes focus. `--cell-accent` is consumed directly by host CSS for links and focus outlines, not by the headless engine.

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

`@chardesk/cell-ui/browser` owns `CellSurface`, Canvas DPR/resize presentation, px-to-Cell conversion, Semantic DOM, React Stately collection adapters, `useCellTextState`, and `useCellRangeState`. Text fields use a real transparent textarea for browser input and textbox semantics while Canvas renders the Cell projection. Semantic DOM emits `EngineInput.semantic`; keyboard, pointer, and accessibility channels converge through `commandForInput` before the single `WidgetCommand` callback. In keyboard/assistive mode, DOM focus follows the same logical `focusedId`, including across modal semantic-tree replacement; pointer mode retains Canvas focus behavior. A modal `Overlay` scopes focus and semantics; Escape or a pointer press outside emits one `dismiss` command, and unmount restores the prior focus target. The browser projection creates DOM per semantic widget, never per Cell. The runnable [component documentation](../../exp/web-tui/#/components/text) owns public previews, workspace distribution facts, usage, and API; complex behavior remains verified by its browser E2E suites.

`CellSurface.fontProfile` selects text faces without overriding Box/Block fonts. Single-codepoint `U+2500–U+259F` uses the [shared Cell graphics renderer](../rendering/README.md#cell-graphics), including caret painting. Loading and Surface font audit skip these graphics. Probe exposes their codepoint, allocated rectangle and renderer version in `cellGraphics`, and omits the unused `requestedFontRoutes["cell-glyph"]` face. Other requested routes describe font rendering; changing the input Profile repaints without changing protocol Cell widths.

Without explicit `metrics`, `CellSurface` synchronously uses its own stable grid:
`9×20px` at `15px`, with baseline `15px`, scaled with `fontSize`. Explicit
`metrics` take precedence. Canvas, pointer coordinates, caret, range and hidden
textarea placement share that stable geometry. Font completion only updates
readiness, glyph presentation and audit; it never resizes a mounted Surface.
`loadCellFontMetrics(profile, fontSize?)` preloads the display face before a host
commits a font switch and returns the same stable grid. Probe v3
`presentation.measurement.source` is `default` or `explicit`; `ready` reports font
availability, not geometry readiness. Load failures retain the grid and remain
retryable.

`DEFAULT_CELL_UI_METRICS` exposes the shared CharDesk product contract; it is the
same object used by the Canvas renderer. See [fixed grids and font
measurement](../rendering/README.md#fixed-cell-grids-and-font-measurement).

`CellSurface.glyphOverflow` defaults to `"clip"`. Experimental `"visible"` lets
font ink cross Cell and widget boundaries, retaining only the Canvas boundary.
Every visible-mode presentation redraws the full Surface to erase overhanging
ink; headless invalidation remains incremental. Switching modes also forces a
full repaint. Cell allocation, hit testing and copying do not change.
Probe v3 exposes `presentation.glyphOverflowMode`. Gallery enables `"visible"`
for inspecting native glyph shapes; pixel isolation and incremental raster
performance are not guaranteed in this experiment.

Text adapters must forward `text` commands, including `set-viewport`, to their
`CellTextEditor`. `CellSurface` and `TestPilot` derive that viewport from layout;
`useCellTextState` handles it automatically. Standalone editors can still specify
an initial viewport. `resolveWheelInput(frame, input)` reports `consumed`
separately from the optional scroll command. [Widget contracts](../../exp/blueprints/widgets.md)
own boundary, background, and editor sizing behavior.

## Cell inspection

With `probeId`, `presentation.fontAudit` reports `loading`, `ready`, or
`unavailable` plus the shared [font audit](../rendering/README.md#font-grid-audit).
`ready` means measurements are available, not that the font fits every Cell.
Its native, Profile and actual Surface metrics remain separate, including when
explicit Surface metrics override the Profile. `formatCellProbe(..., { header:
true })` prints dimension sources and a bounded list of gaps/overhangs; JSON
retains all samples and requested family stacks, not inferred fallback identity.

The browser loads a fixed ASCII/CJK/border sample set in regular/requested-bold
states only for enabled probes. Audits are cached by Profile identity and actual
metrics, refreshed on `loadingdone` and re-subscription, and never resize a grid
or repeat on ordinary frame updates. Failed loads or unavailable bounds are
reported as unverified. Existing v3 fields remain unchanged.

TextArea automatically consumes the shared scroll geometry and half-Cell rails on overflow; TextInput keeps rails hidden. Text layout and viewport synchronization use `SceneEntry.scrollMetrics.viewport`. ScrollArea still emits `scroll` commands; editor rails emit `text` commands containing `set-scroll`. `TestPilot.scroll()` supports both. No extra ScrollArea wrapper or duplicate offset state is needed; [editor viewport contracts](../../exp/blueprints/widgets.md#编辑视口与-canvas-边界) own sizing, caret reveal, and input boundaries.

`ScrollMetrics.horizontalThumbAxis` / `verticalThumbAxis` expose `HalfCellThumb`: integer `start` and `length` in half-Cell units relative to the track. Existing thumb rectangles remain integer covering bounds. Each thumb Cell uses the Unicode glyph `█`, `▄/▀`, or `▐/▌`; themes supply `scrollThumbStyle`. Widget behavior is owned by [Pointer and Scroll](../../exp/blueprints/widgets.md#pointer-与-scroll).

`TestPilot.pointerDown/Move/Up(point, pointerId?, precisePoint?)` accept an optional floating Cell position for scrollbar gestures; omission uses the integer Cell's center. The browser uses `pxToCellPosition` for this precision and retains `pxToCellPoint` for grid hits. Layout and content offsets remain integer Cells. Thumb dragging anchors cumulative displacement to pointer-down geometry; geometry/range changes cancel the gesture.

`CellBuffer.writeGrapheme(..., clip, composition)` and `writeText(..., clip, maxWidth, composition)` accept `CellComposition`: default `"replace"` replaces the entire Cell; `"over"` preserves only an unspecified background from the destination. Scene painting uses `"over"`; [compositor contracts](../../exp/blueprints/compositor.md#行为契约) own layering and wide-Cell behavior.

`CellBuffer.toText()` is the single text-extraction authority used by Cell Range, probes, TestPilot, and browser `data-cell-text`. It owns region clipping, half-selected wide graphemes, and optional removal of empty ASCII padding; NBSP, ideographic space, combining sequences, emoji, and ZWJ graphemes remain data. `CellProbeSnapshot` v3 is the character-level test oracle. Its dense `cells` retain exact dimensions, blank Cells, wide-grapheme continuation, owner, and style. Canvas renders the same Unicode foreground.

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

`FixedVirtualGrid` owns a fixed-Cell two-dimensional window: visible/cache ranges, stable row-key anchor, reveal alignment, bounded keepAlive, and content extent. It materializes only cached cells, including for 100k-row collections. `useCellVirtualListState` adapts its one-column projection to `List + ScrollArea`; the virtual content height and leading Cell padding preserve native SceneGeometry, hit testing, focus reveal, and scroll commands without mounting placeholder Widgets. PageUp/PageDown move focus by one visible page; wheel and drag preserve selection and move an offscreen focus to the nearest visible enabled row. Each projected `ListItem` carries its logical `positionInSet` and full `setSize`, so the bounded Semantic DOM still exposes the position and total through `aria-posinset` and `aria-setsize`. The runnable contract is verified by [the browser E2E suite](../../e2e/web-tui-virtual-list.spec.ts).

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

Cell Range selects the final rendered projection, including borders and blank Cells. Drag with Option+Command on macOS or Alt on other platforms; copy writes the current rectangle as `text/plain`, preserving internal alignment and trimming only trailing spaces per row. Rectangle normalization computes a fixed point across all selected rows, so neither vertical edge can retain half of a wide grapheme after another row expands the bounds. A range clears when focus leaves its `CellSurface`, but survives focus transfers within the Surface and temporary browser-window deactivation. `CellSurface` owns this state by default. Passing `cellRange` and `onCellRangeCommand` makes it controlled; `cellRange={null}` without a command handler disables selection. In uncontrolled mode, an optional command handler observes updates without taking ownership.

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
