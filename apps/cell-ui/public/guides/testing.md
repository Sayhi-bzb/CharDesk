# Testing

Inspect the committed Cell frame instead of inferring behavior from pixels.

## Cell probe

Set probeId only on development or test surfaces. readCellSurfaceProbe(element) returns the latest structured frame, including exact glyphs, styles, owners, geometry, and overlays. Without probeId no structured snapshot is created; data-cell-text remains the lightweight projection.

```tsx
const snapshot = readCellSurfaceProbe(
  document.querySelector('[data-cell-probe="example"]')!,
);
console.log(snapshot?.text);
```

## Font audit

Set fontAudit explicitly to verify font measurements against Cell metrics. A ready font is measurable, not necessarily fitting every Cell. Use screenshots for rasterization, color, and DPR; use probes for text, borders, clipping, scrollbars, and interaction results.

## Headless and browser tests

TestPilot consumes the same interaction controller as the browser. Verify command/state contracts headlessly and use browser E2E for focus, native input, font loading, and Canvas presentation.

## Agent inspection and verification

Canvas glyphs are not individual DOM nodes. Use the committed Cell frame as the inspection source:

```ts
import { inspectCellFrame, verifyCellFrame } from "@chardesk/cell-ui";

const inspection = inspectCellFrame(frame, { x: 12, y: 4 });
const issues = verifyCellFrame(frame);
```

Inspection snapshots and probe cells expose compact, deterministic agent refs
(`ownerRef`, `hitRefs`, `semanticRef`, `rootRef`, `focusedRef`) while retaining canonical
ids in `ownerId`, `hitStack`, and `semantic.id`.
The compact form keeps an intent prefix and child path, for example
`timeline-range/abc123/text[0]`; it is safe to use for logs and cross-frame correlation.

Browser surfaces expose the same frame through the geometry registry:

```ts
import { resolveCellSurfaceInspection, verifyCellSurface } from "@chardesk/cell-ui/browser";

const target = document.querySelector("[data-cell-surface]")!;
const hit = resolveCellSurfaceInspection(target, {
  clientPoint: { clientX: event.clientX, clientY: event.clientY },
});
const issues = verifyCellSurface(target);
```

The development bridge also provides `references(surfaceId)` and
`resolveRef(surfaceId, ref)` for translating a compact ref back to its canonical id.
Hosts that render a non-Cell canvas can register a typed debug artifact with
`registerCellDebugAdapter({ id, snapshot, verify })`; agents read it through
`artifact(surfaceId)` without confusing a host render surface with a Cell frame.

## Agent default

Browser hosts should call `installCellDebugBridge()` once in development. This
publishes the same inspection contract at `window.__CELL_UI_DEBUG__` even when the
visual overlay is disabled. Agents can then run `listSurfaces`, `snapshot`,
`inspect`, `verify`, `trace`, `references`, and `resolveRef` without guessing DOM
selectors. Add `?cell-debug=1` only when the visual owner highlight is needed.

For development-only visual feedback, mount `CellInspectorOverlay`. It highlights the
resolved Cell owner and reports its semantic role, bounds, and hit stack without entering
Cell layout or intercepting pointer input.
