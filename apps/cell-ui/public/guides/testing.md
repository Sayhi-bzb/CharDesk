# Testing

Inspect the committed Cell frame instead of inferring behavior from pixels.

## Cell probe

Set probeId only on development or test surfaces. readCellSurfaceProbe(element) returns the latest structured frame, including exact glyphs, styles, owners, geometry, and overlays. Without probeId no structured snapshot is created; data-cell-text remains the lightweight projection.

```tsx
const snapshot = readCellSurfaceProbe(
  document.querySelector('[data-cell-probe="example"]')!
);
console.log(snapshot?.text);
```

## Font audit

Set fontAudit explicitly to verify font measurements against Cell metrics. A ready font is measurable, not necessarily fitting every Cell. Use screenshots for rasterization, color, and DPR; use probes for text, borders, clipping, scrollbars, and interaction results.

## Headless and browser tests

TestPilot consumes the same interaction controller as the browser. Verify command/state contracts headlessly and use browser E2E for focus, native input, font loading, and Canvas presentation.
