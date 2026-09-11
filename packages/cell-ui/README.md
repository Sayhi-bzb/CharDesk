# @chardesk/cell-ui

React Cell UI runtime. Its root entry is headless; the `/browser` entry projects the same committed frame to Canvas2D and Semantic DOM.

`createCellBufferSource()` exposes the committed dense buffer through the
storage-neutral `@chardesk/cell-core` contract. `createCellUiRenderFrame()` maps
that source to the same Canvas Presenter used by the document Canvas; Widget,
Scene, focus, gesture, semantics, and text-input state remain Cell UI concerns.

`runtime.setTheme(overrides)` replaces theme overrides for the next render; `undefined` restores defaults. Theme-only commits repaint the full buffer while reusing layout and scene. `CellSurface` retains its runtime across theme and viewport changes, preserving monotonic revisions, and repaints when fonts finish loading.

Keyboard and semantic focus use one background-and-bold style. Pointer input retains logical focus but presents only transient component hover; moving the pointer away clears it. `focusedSurfaceStyle` supplies the unselected focus background, `selectedStyle` preserves selection colors, and `focusedItemStyle` supplies the keyboard focus accent. Editors keep their caret/selection styling without this accent. Headless rendering remains modality-neutral unless the host supplies focus options.

## Basic widgets

`Dialog`, `DialogTitle`, `DialogDescription`, and `DialogFooter` compose a standard Overlay shell. Conditionally mount a Dialog with a stable `id`; handle its `dismiss` command to close. Include one direct, non-empty Title and optionally one direct Description; accessible relations are automatic. Defaults: modal, outside-click dismissal, 36-Cell width, centered in the Surface, theme border and background. `initialFocusId` selects an available content control; otherwise focus enters the first control or the empty Dialog itself. Footer aligns ordinary Buttons to the end. Long bodies compose ScrollArea. [Gallery usage](../../apps/cell-ui/src/component-catalog.tsx) · [Behavior contract](../../apps/docs/content/docs/development/cell-ui/widgets.mdx).

`Overlay.closeOnOutsideClick` defaults to true. Dialog does not dismiss on host blur; Escape and the topmost nested overlay retain their own dismissal ownership. Modal Dialog cycles Tab; nonmodal Dialog permits normal traversal. Closing restores its opener when focus was still inside; a nonmodal user who moved elsewhere keeps that focus. Mouse opening retains pointer appearance and logical content focus; keyboard input projects that focus to Semantic DOM.

`Accordion`, `AccordionItem`, `AccordionTrigger`, and `AccordionContent` compose independent controlled disclosures. Handle `set-expanded` using its Item `targetId`; each Item requires a stable `id` and exactly Trigger then Content. Collapsed content retains descriptor identity and externally controlled values, but leaves layout, hit testing, focus traversal and accessible reading. [Behavior contract](../../apps/docs/content/docs/development/cell-ui/widgets.mdx) · [Gallery usage](../../apps/cell-ui/src/component-catalog.tsx).

`Toggle`, `Progress`, `Separator`, `RadioGroup` and `RadioItem` consume the same theme and capability resolver. Their [Gallery pages](../../apps/cell-ui/src/component-catalog.tsx) own executable usage examples; the [Widget contract](../../apps/docs/content/docs/development/cell-ui/widgets.mdx) owns behavior. `useCellRadioState(items, { value?, defaultValue?, disabled?, onValueChange? })` is exported from `/browser`; its `dispatch` accepts focus, activate and immediate `select-radio` navigation commands. Item IDs target commands; item values determine selection. Group `disabled` must also be passed to the state adapter when dispatching commands directly.

## Feedback consumption

`CellSurface`, `CellUiRuntime` and test-pilot options accept `feedback?: Partial<CellFeedbackConfig>`. `CLASSIC_CELL_FEEDBACK` is the default (2 blinks); `INSTANT_CELL_FEEDBACK` uses 0. Both share hover and physical press feedback. Zero skips confirmation timers and immediately completes Select dismissal; business selection commits before either mode finishes. Changing browser feedback settles pending confirmation. `runtime.setFeedback()` restores the default.

```tsx
<CellSurface feedback={INSTANT_CELL_FEEDBACK} {...surfaceProps} />
```

Gallery accepts feedback once on `GalleryAppearance` and distributes it to every `GallerySurface`. `widget-capabilities.ts` owns feedback areas/capabilities; state projection and appearance recipes feed resolved styles and glyphs to Painter. The [Widget contract](../../apps/docs/content/docs/development/cell-ui/widgets.mdx#状态与主题) owns migrated controls and precedence.

## Shared interaction foundation

Browser and TestPilot consume the same internal `CellInteractionController` for key/press/gesture and confirmation ordering. The browser retains native focus, input, capture and occlusion adaptation. `render()` accepts a `confirmation` presentation snapshot (session ID, phase, target and reference color pair); `activationTargetId` and `activationFlashId` remain available as derived phase indicators. `FrameSnapshot.colors` records fallback colors; `render(..., { colors })` may supply the host palette. Public component props and command shapes remain unchanged. [Ownership and verification](../../apps/docs/content/docs/development/cell-ui/primitives.mdx).

## Theme consumption

`CLASSIC_MAC_LIGHT_THEME` is the black-first System 6–7 translation and the package default; `CLASSIC_MAC_DARK_THEME` preserves the same hierarchy by inversion. Both retain Maple Mono Cell metrics and modern browser input/accessibility behavior. `resolveCellUiTheme(partial)` applies overrides to the light default.

`CellSurface` separates retained logical `focusedId`, exact DOM `activeFocusId`, and modality-gated `focusVisible`. A textarea or Semantic DOM node activates only its matching widget; Surface blank space owns browser focus without activating the retained navigation target. Mouse movement and pointer down switch to pointer mode without clearing logical focus, while the next key or semantic focus restores visible focus. Blur preserves selection and editing state. Internal DOM focus transfers update the active identity; external/null-target blur and window changes recheck ownership before restoring focus. Headless `render(..., { activeFocusId?, focusVisible? })` defaults keep focused content active and visible unless explicitly overridden.

Block-owning components expose one mutually exclusive `variant`: `plain` is transparent, `raised` fills the rectangle with `raisedSurfaceStyle`, and `bordered` fills it with `surfaceStyle` and reserves one Cell per edge for Unicode chrome. `borderShape` accepts `"square"` or `"rounded"` (`╭╮╰╯`) and otherwise inherits `CellUiTheme.borderShape`. Shape is paint-only and rounded corners do not clip the rectangular background. `CellLayoutStyle` owns geometry only.

`render(..., { hoveredId })` supplies optional transient hover; omission clears it. `WidgetNode.hovered` affects paint only, not layout or semantic nodes. Button, Checkbox, Select, Toggle, RadioItem, List, Menu, Tree, Tabs and Grid use inverse highlight; `hoveredItemStyle` / `--cell-hover` remains the other components’ hover recipe. Default Buttons use `buttonPrimaryStyle`; `buttonPrimaryHoverStyle` remains accepted but is not consumed by the inverse recipe; outline Buttons retain bracket chrome and ghost Buttons remain transparent. Disabled default Buttons return to `surfaceStyle` before `disabledStyle` is applied. `GestureManager.manipulatingIds` owns pointer-captured continuous manipulation and `render(..., { manipulatingIds })` projects it as paint-only `WidgetNode.manipulating`; it starts on pointer down rather than after the drag threshold and clears on release, cancellation, capture loss, blur, or candidate invalidation. Slider emphasizes only its thumb from `sliderThumb` (`┃`) to `sliderEmphasizedThumb` (`█`) while hovered, keyboard-focused or manipulating; RangeSlider uses the same recipe per thumb. `CellSurface` derives hover and the browser pointer from Scene hits and modal scope, updates only when the resolved target changes, and rechecks stationary pointers on frame/scroll/resize changes. Hover is mouse-only; down/drag suspends it, up restores it, and leave/cancel/capture loss/window blur clears it. Manipulation bridges that suspension without pretending the pointer is still hovering. Select/Menu item hover emits provisional focus, never selection or execution; other hover and manipulation projections do not emit business commands. The browser pointer is `pointer` for actionable items and `default` elsewhere, including editor content; editing position is expressed only by the Canvas Cursor.

`PressManager` owns physical `pressActive`; confirmation waits for release without changing business commit timing. `CellFeedbackConfig.activationBlinkCount` accepts `0`–`3` (default `2`); `0` completes immediately. The [feedback lifecycle](../../apps/docs/content/docs/development/cell-ui/primitives.mdx#生命周期) owns full cycles, presentation acknowledgements and cancellation. Persistent `open`, `checked`, `selected`, and ARIA toggle `pressed` states remain separate. Probe V4 adds optional `confirmation`; `data-cell-confirmation-session` and `data-cell-confirmation-phase` expose the presented session/phase alongside existing press/flash attributes. `activationFlashId` identifies a relative inverse phase, not an absolute background color.

`primitive-appearance.ts` owns control and collection inverse composition and Slider/RangeSlider thumb emphasis; `visual.ts` resolves editor activity, Block substrate, and final border styles; `resolveCellTextStyle(base, state, theme)` adds text selection and composition. Painter supplies geometry, not color policy. `surfaceStyle`, `raisedSurfaceStyle`, and `borderStyle` supply Block recipes; descendants inherit the nearest effective Block background. `cursorStyle` / `rangeStyle` configure browser overlays. `background` / `foreground` supply the Canvas palette unless `CellSurface.palette` is explicitly provided. The private experimental API does not retain compatibility aliases.

### Cursor

`CellCursorStyle.colorMode` is `"inverse"` by default (including omission). `cursor-appearance.ts` consumes the committed target Cell's colors, filling absent channels from the presentation palette. A `block` cursor exchanges foreground/background and redraws the allocated grapheme; `bar` and `underline` use its foreground. This follows editor activity and text selection without interpreting widget state again. Set `colorMode: "fixed"` to consume `color` / `textColor`, including the existing `--cell-cursor` / `--cell-cursor-foreground` CSS tokens. These tokens do not override inverse mode. Shared renderer and main Canvas cursor policy are unchanged.

Shape defaults to `block`; `blink` and `blinkIntervalMs` remain independent of activation feedback. Blink restores captured pixels without a Runtime commit. Base presentation restores the old cursor before drawing, then captures the new bottom image and shows the cursor from the new Frame. Blur hides it, page visibility pauses it, and reduced motion keeps it visible. Cell Range and Cursor are mutually exclusive overlays; clearing a Range restores the retained Cursor. Neither changes Cell text or clipboard output. [Color projection tests](src/cursor-appearance.test.ts), [pixel verification](../../apps/cell-ui/e2e/cursor.spec.ts).

`Toggle` reserves a status light and spacing before its children: `○ Bold` / `● Bold`. `CellUiTheme.toggleOffIndicator` and `toggleOnIndicator` supply the glyphs; `pressed` remains the controlled value and `aria-pressed` projection. Toggle and Radio retain their value marks without persistent selection backgrounds. Character-theme overrides use `CellUiTheme`; CSS tokens supply colors.

List/Tree/Grid reserve a fixed selection column using `collectionSelectedIndicator` (default `✓`); Tree disclosure uses a separate column. Tabs retain their selected underline, not a persistent background. These controls activate immediately without confirmation flashing. Menu is different: Surface defers `activate` and therefore `useCellMenuState.onAction` until confirmation completes; `0` is immediate. Cancellation discards the pending action. Callers close overlays or navigate in `onAction`; the engine does not close arbitrary ancestors. Direct adapter dispatch has no presentation lifecycle. See the [feedback lifecycle](../../apps/docs/content/docs/development/cell-ui/primitives.mdx#生命周期).

Grid uses one Tab entry, remembering its last available target before falling back to selection and coordinate order. Arrow keys skip disabled/missing cells along the same row or column without wrapping; Home/End stay within the current row. Navigation does not select. GridCell reserves two internal Cells for selection chrome even with zero consumer padding; supplied width remains unchanged. Range copying remains independent of business selection. The [Widget contract](../../apps/docs/content/docs/development/cell-ui/widgets.mdx) owns focus invalidation and input boundaries.

The `/browser` entry exports `readCellCssTheme(element)` and `useCellCssTheme(ref, revision)`, returning `{ theme, palette }`. The hook reads after mount and whenever the explicit string/number revision changes. Apply CSS changes before its layout effect; external stylesheet edits require a revision bump. No DOM mutation observer, per-frame CSS read, or DOM-per-Cell is created. Missing/invalid fields use `DEFAULT_CELL_UI_THEME`; development builds report the token name.

Supported color tokens (prefix each with `--cell-`): `background`, `foreground`, `surface`, `surface-raised`, `button-primary`, `button-primary-foreground`, `button-primary-hover`, `hover`, `highlight`, `highlight-foreground`, `muted-foreground`, `disabled-foreground`, `border`, `selection`, `selection-foreground`, `range-surface`, `range-border`, `cursor`, `cursor-foreground`, `scrollbar-thumb`, `scrollbar-track`. Browser CSS resolves inherited values and aliases; the adapter resolves colors before Canvas consumes them. `surface-raised` is a visual depth cue only and never enters Cell text or semantics. `highlight` feeds the legacy focus/selection recipes; the three unified controls derive inverse colors from their base pair. `--cell-accent` is consumed directly by host CSS for links and focus outlines, not by the headless engine.

```tsx
const container = useRef<HTMLDivElement>(null);
const { theme, palette } = useCellCssTheme(container, themeRevision);
return <div ref={container}>
  <CellSurface theme={theme} palette={palette} {...surfaceProps} />
</div>;
```

Gallery color values live only in [its CSS](../../apps/cell-ui/src/styles.css). Host tokens can be aliased, e.g. `--cell-highlight: var(--accent)`. No Tailwind or shadcn dependency is required; the root engine continues accepting plain theme data without a browser.

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
    <ScrollArea variant="bordered" style={{ height: 6 }}>
      <List>
        <ListItem><Text>01  src/index.ts</Text></ListItem>
      </List>
    </ScrollArea>
  </Root>
);

console.log(formatCellProbe(captureCellProbe(frame), { header: true }));
runtime.dispose();
```

`Root`, `Box`, `Overlay`, `Text`, `Button`, `Checkbox`, `Slider`, `RangeSlider`, `Select`, `Combobox`, collection widgets, and text editors are descriptors consumed by `CellUiRuntime`; they are not DOM components. `Button` is a one-row actionable descriptor with one Cell of horizontal padding; pointer, keyboard, and semantic input emit the same `activate` command. `Checkbox` reserves `[ ] ` as renderer-owned chrome and accepts `false`, `true`, or `"indeterminate"`; `nextCellCheckboxState()` maps mixed to checked before entering the binary toggle cycle. `Slider` owns a one-row `━/─/┃` track and emits controlled `set-value` commands from stepped keyboard input, precise track taps, and drag. `RangeSlider` owns the same track with exactly two direct `RangeSliderThumb` children; each thumb has its own required `id`, `label`, controlled `value`, focus, and `set-value` target, while the interval between them uses `━`. Track taps choose the nearest thumb, thumbs cannot cross, and the selected interval is not draggable. Visible labels and values remain ordinary Cell composition. `Select` composes `SelectTrigger`, `SelectContent`, and `SelectItem`; its Content portals beside the Trigger, flips above when required by the Cell viewport, and keeps provisional focus separate from committed selection. `Combobox` composes one `ComboboxInput` and optional `ComboboxContent` with `ComboboxItem` candidates; its input remains the focus owner while active candidate and committed selection stay independent. `TextInput` and `ComboboxInput` are fixed one-Cell-high, borderless filled surfaces; their public `style` accepts only width constraints and flex growth/shrinkage, and descriptor normalization discards multiline geometry fields at runtime. `TextArea` owns multiline geometry, Block appearance, padding, and rails. The collection set includes `List`, `Menu`, `Tree`, `Tabs`, and `Grid` with their item, row, and panel descriptors. Containers accept integer Cell layout through `style`; all four padding edges may be overridden independently. Explicit `id` values are globally stable; keyed children receive parent-scoped stable ids; unkeyed children follow React position identity.

Every `render()` is one commit and emits exactly one read-only `FrameSnapshot` through `onFrame`. The snapshot exposes reconciliation mutations, `WidgetTree`, `LayoutSnapshot`, `SceneSnapshot`, `CellBuffer`, `SemanticSnapshot`, and a phase/work/dirty-region invalidation report. Paint-only commits reuse Layout/Scene; geometry-only commits reuse Layout; unchanged commits reuse Buffer and skip present. Rendering `null` unmounts the tree and emits a blank frame. `CellUiRuntime` owns and disposes its injected `LayoutEngine`; the default `YogaLayoutEngine` uses `pointScaleFactor = 1` and retains Yoga Nodes by stable WidgetId until removal or disposal.

`TestPilot` is the browser-free interaction surface. It executes keyboard, Cell pointer/gesture, semantic action, scroll and resize input, then exposes the committed frame, Cell text, scene, hit, focus and role/name semantic queries. `press()` remains the concise key-sequence API; `pressKey()`, `keyDown()`, and `keyUp()` preserve code, location, modifiers, repeat, and composition for deterministic keyboard tests. `probe()` returns the same serializable `CellProbeSnapshot` exposed by an inspectable browser Surface; `inspect(point)` diagnoses the rendered Cell, owner, Scene entry, hit stack and focus at one coordinate. `auditSemanticSnapshot()` validates names, traversal, bounds, focus, relationships and actions. `CELL_UI_PERFORMANCE_BUDGET` owns the executable scale, steady-scroll and raster thresholds.

`KeyInput` from [`@chardesk/keyboard`](../keyboard/README.md) is the shared headless keyboard fact. It preserves `down`/`up`, logical `key`, physical `code`, key location, Alt/Ctrl/Meta/Shift/AltGraph, repeat, and composition. Widgets act only on non-composing key-down events without Alt/Ctrl/Meta/AltGraph; Shift remains available. Navigation may repeat, while activate and dismiss do not. Text editors consume the same key facts for movement, selection, undo/redo, and Enter; printable text, deletion, composition, paste, and clipboard remain owned by `beforeinput` and textarea events. Cell UI owns Widget interpretation, not Host shortcut scopes, chords, user keymaps, ANSI, CSI-u, or Kitty protocols.

Geometry distinguishes the root-relative border box, decoration box, and content box. Yoga exports per-edge border/padding Insets; SceneGeometry derives `decorationBounds`, `outerClip`, and `contentClip`. Painting is ordered Surface → Chrome → Content → Decoration, and decoration is clipped inside the border. Borders, padding, and Widget chrome are therefore protected from state fills, ordinary content, descendants, and focus/disclosure decoration. Portal capability is shared: `Overlay` uses an explicit integer Cell `position`, while `SelectContent` anchors to its preceding `SelectTrigger` and flips within the overlay viewport. Overlay, SelectContent, and ComboboxContent default to `raised`; Dialog defaults to `bordered`. All retain their declaration parent for events and semantics and escape its visual clip.

`@chardesk/cell-ui/browser` owns `CellSurface`, Canvas DPR/resize presentation, px-to-Cell conversion, DOM keyboard adaptation, Semantic DOM, React Stately collection adapters, `useCellSelectState`, `useCellComboboxState`, `useCellTextState`, and `useCellRangeState`. `CellSurface.viewport` remains the layout-sized base plane; optional `overlayViewport` is a larger root-layer collision and presentation boundary. A frame exposes `baseBuffer`, transparent `overlayBuffer`, their composite `buffer`, and visible `overlayPlanes`. The browser keeps the base Canvas in document flow and presents each portal on an absolute transparent Canvas, so opening a popup neither resizes nor scrolls the base Surface. All planes share one Scene, focus graph, Semantic DOM, and global Cell coordinate system; pointer input on an overlay resolves through the same hit-test and command path. `useCellSelectState` supports controlled or uncontrolled open/selection state and owns constrained listbox scrolling; direction keys move provisional focus, activation commits, and dismissal restores the Trigger without changing the selected value. `useCellComboboxState` adds controlled or uncontrolled query state, stable case-insensitive substring filtering, composition-safe commit, and an active descendant that never becomes another Tab stop. `SelectContent` and `ComboboxContent` are root-layer Cell overlays: they do not affect ancestor layout or scroll measurement, never cover their anchor, flip when they fully fit above, and otherwise scroll within the larger available side. Open dropdowns dismiss on Escape, a pointer press outside Content, or confirmed browser focus exit from their `CellSurface`; Select preserves committed selection, while Combobox also restores its committed label. Text fields use a real transparent textarea for browser input and textbox or combobox semantics while Canvas renders the Cell projection. Semantic DOM emits `EngineInput.semantic`; keyboard, pointer, and accessibility channels converge through `commandForInput` before the single `WidgetCommand` callback. In keyboard/assistive mode, DOM focus follows the same logical `focusedId`, including across modal semantic-tree replacement; pointer mode retains Canvas focus behavior. A modal `Overlay` scopes focus and semantics; Escape or a pointer press outside emits one `dismiss` command, and unmount restores the prior focus target. The browser projection creates DOM per semantic widget, never per Cell. The runnable [component documentation](../../apps/cell-ui/src/component-catalog.tsx) owns public previews, workspace distribution facts, usage, and API; complex behavior remains verified by its browser E2E suites.

`CellSurface.fontProfile` selects text faces without overriding Box/Block fonts. Single-codepoint `U+2500–U+259F` uses the [shared Cell graphics renderer](../rendering/README.md#cell-graphics); Block Cursor redraw uses the same glyph route as its underlying Cell. Loading and Surface font audit skip these graphics. Probe exposes their codepoint, allocated rectangle and renderer version in `cellGraphics`, and omits the unused `requestedFontRoutes["cell-glyph"]` face. Other requested routes describe font rendering; changing the input Profile repaints without changing protocol Cell widths.

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

Font ink may cross Cell and widget boundaries, retaining only the Canvas Surface
boundary. Every presentation redraws the full Surface to erase overhanging ink;
headless invalidation remains incremental. Cell allocation, hit testing, and
copying do not change. Probe v5 reports measured `glyphInkOverhang` as paint
geometry rather than an error or rendering mode.

Text adapters must forward `text` commands, including `set-viewport`, to their
`CellTextEditor`. `CellSurface` and `TestPilot` derive that viewport from layout;
`useCellTextState` handles it automatically. Standalone editors can still specify
an initial viewport. `resolveWheelInput(frame, input)` reports `consumed`
separately from the optional scroll command. [Widget contracts](../../apps/docs/content/docs/development/cell-ui/widgets.mdx)
own boundary, background, and editor sizing behavior.

## Cell inspection

With `probeId`, the snapshot remains observational and requests only glyphs in
the current frame. Set `fontAudit` explicitly to make `presentation.fontAudit`
report `loading`, `ready`, or `unavailable` plus the shared
[font audit](../rendering/README.md#font-grid-audit).
`ready` means measurements are available, not that the font fits every Cell.
Its native, Profile and actual Surface metrics remain separate, including when
explicit Surface metrics override the Profile. `formatCellProbe(..., { header:
true })` prints dimension sources and a bounded list of gaps/overhangs; JSON
retains all samples and requested family stacks, not inferred fallback identity.

The browser loads a fixed ASCII/CJK/border sample set in regular/requested-bold
states only for `fontAudit` surfaces. Audits are cached by Profile identity and actual
metrics, refreshed on `loadingdone` and re-subscription, and never resize a grid
or repeat on ordinary frame updates. Failed loads or unavailable bounds are
reported as unverified. Existing v3 fields remain unchanged.

TextArea automatically consumes the shared scroll geometry and half-Cell rails on overflow. TextInput and ComboboxInput keep their fixed one-row surface and rails hidden while retaining horizontal offset. Text layout and viewport synchronization use `SceneEntry.scrollMetrics.viewport`. ScrollArea still emits `scroll` commands; editor rails emit `text` commands containing `set-scroll`. `TestPilot.scroll()` supports both. No extra ScrollArea wrapper or duplicate offset state is needed; [editor viewport contracts](../../apps/docs/content/docs/development/cell-ui/widgets.mdx#编辑视口与-canvas-边界) own sizing, caret reveal, and input boundaries.

`ScrollMetrics.horizontalThumbAxis` / `verticalThumbAxis` expose `HalfCellThumb`: integer `start` and `length` in half-Cell units relative to the track. Existing thumb rectangles remain integer covering bounds. Each thumb Cell uses the Unicode glyph `█`, `▄/▀`, or `▐/▌`; themes supply `scrollThumbStyle`. Widget behavior is owned by [Pointer and Scroll](../../apps/docs/content/docs/development/cell-ui/widgets.mdx#pointer-与-scroll).

`TestPilot.pointerDown/Move/Up(point, pointerId?, precisePoint?)` accept an optional floating Cell position for scrollbar gestures; omission uses the integer Cell's center. The browser uses `pxToCellPosition` for this precision and retains `pxToCellPoint` for grid hits. Layout and content offsets remain integer Cells. Thumb dragging anchors cumulative displacement to pointer-down geometry; geometry/range changes cancel the gesture.

`CellBuffer.writeGrapheme(..., clip, composition)` and `writeText(..., clip, maxWidth, composition)` accept `CellComposition`: default `"replace"` replaces the entire Cell; `"over"` preserves only an unspecified background from the destination. Scene painting uses `"over"`; [compositor contracts](../../apps/docs/content/docs/development/cell-ui/compositor.mdx#行为契约) own layering and wide-Cell behavior.

`CellBuffer.toText()` is the single text-extraction authority used by Cell Range, probes, TestPilot, and browser `data-cell-text`. It owns region clipping, half-selected wide graphemes, and optional removal of empty ASCII padding; NBSP, ideographic space, combining sequences, emoji, and ZWJ graphemes remain data. `CellProbeSnapshot` v4 is the character-level test oracle. Its dense `cells` retain exact dimensions, blank Cells, wide-grapheme continuation, owner, and style; `viewport` remains the base plane while `overlayViewport` and `overlays` expose portal bounds, text, and Cells separately. Canvas renders the same Unicode foreground.

Set `probeId` only on development or test surfaces. The browser adapter then stores the latest snapshot on that Surface; `readCellSurfaceProbe(element)` retrieves it from the Surface or any descendant. Without `probeId`, no structured snapshot is created. `data-cell-text` remains the lightweight readable projection.

```tsx
<CellSurface probeId="editor" fontAudit viewport={{ width: 40, height: 13 }} onCommand={dispatch}>
  {children}
</CellSurface>

const snapshot = readCellSurfaceProbe(document.querySelector('[data-cell-probe="editor"]')!);
console.log(snapshot?.text);
```

Use Cell probes for characters, borders, clipping, scrollbars and interaction results. Use screenshots only for font rasterization, color, DPR and other pixel presentation concerns.

`EventManager` routes Cell pointer input over `SceneSnapshot.eventParentId`: capture runs root-to-target, bubble runs target-to-root, and logical pointer capture survives movement outside hit bounds. `sync()` cancels capture when its owner is removed, hidden, or disabled. `GestureManager` is the deterministic tap/drag/scroll arena; an axis-matched winner receives start/update/end while every losing recognizer receives cancel. `CellSurface` uses this path for collection-item taps and drag scrolling.

`useCellMenuState`, `useCellTreeState`, `useCellTabsState`, and `useCellGridState` keep collection, focused, selection, expansion, and tab-panel state outside the renderer. Menu and Tree use vertical navigation; Tree Left/Right collapses, expands, enters children, and returns to parents; Tabs wrap horizontally with automatic selection; Grid uses row/column metadata for two-dimensional navigation. The same descriptor state produces Canvas paint and `menu`, `tree`, `tablist`, `tabpanel`, and `grid` semantics.

`FixedVirtualGrid` owns a fixed-Cell two-dimensional window: visible/cache ranges, stable row-key anchor, reveal alignment, bounded keepAlive, and content extent. It materializes only cached cells, including for 100k-row collections. `useCellVirtualListState` adapts its one-column projection to `List + ScrollArea`; the virtual content height and leading Cell padding preserve native SceneGeometry, hit testing, focus reveal, and scroll commands without mounting placeholder Widgets. PageUp/PageDown move focus by one visible page; wheel and drag preserve selection and move an offscreen focus to the nearest visible enabled row. Each projected `ListItem` carries its logical `positionInSet` and full `setSize`, so the bounded Semantic DOM still exposes the position and total through `aria-posinset` and `aria-setsize`. The runnable contract is verified by [the browser E2E suite](../../apps/cell-ui/e2e/virtual-list.spec.ts).

```tsx
const files = useCellVirtualListState(items, {
  scrollId: "files",
  viewportRows: 9,
  overscanRows: 2,
});

<ScrollArea id="files" variant="bordered" scrollY={files.scrollY} style={{ height: 11 }}>
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
    variant="bordered"
    style={{ width: 30, height: 7 }}
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
      variant="bordered"
      style={{ height: 7 }}
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
