# TachyonFX bridge

This bridge runs TachyonFX 0.25.2 for live terminal agent feedback. It operates on
owned grayscale masks; document glyphs, wide followers, hyperlinks and
color-intent metadata never cross into Ratatui. OpenTUI paints the resulting tint
through its existing checked drawing APIs. No animation writes document content.

[`Cargo.toml`](Cargo.toml) and [`Cargo.lock`](Cargo.lock) pin upstream dependencies.
[`src/lib.rs`](src/lib.rs) owns effect composition and the synchronous WASM ABI.
[`tachyonfx.ts`](../src/tachyonfx.ts) owns isolated instances and handles.
[`activityEffects.ts`](../src/activityEffects.ts) owns region lifetime, stable actor colors,
viewport clipping and invalidation on content or document changes. The Host's
shared animation clock advances effects only while any are alive.

[`CanvasActivityEvent`](../../local-runtime/src/agents.ts) is a live, advisory
channel independent of persisted inbox/read receipts. Successful identified
`canvas_read` calls publish their resolved viewport and captured content version.
Anonymous, failed, overview-only and draft reads do not publish this feedback.
One latest region per actor is retained, with eight concurrent actors per Host.
Human selections take precedence. Without resolved terminal RGB, the read fill
uses native indexed colors instead of RGB interpolation.

Identified `canvas_write`, `canvas_render`, `canvas_erase` and `canvas_fill` commits publish their forward and inverse cell-plane
operations before persistence is awaited. No-op, anonymous, rejected, draft and
batched mutations do not publish mutation feedback. The commit and Undo remain atomic;
animation never delays persistence or changes content versions.

[`mutationPresentation.ts`](../src/mutationPresentation.ts) projects only the visible
transition. Writes up to one [read camera](../../editor-core/src/viewport.ts) of
cells reveal whole graphemes with a cursor and a twelve-grapheme fill trail;
larger writes reveal rows. Render replaces changed rows, erase clears rows
bottom-up, and fill changes styles by row. Only the inverse operation's changed
footprint participates; unchanged input text stays stable. Character duration is
capped at nine seconds and row duration at six seconds. Overlapping old/new
graphemes reveal together. TachyonFX sweep masks own reveal timing.
Feedback covers the most recently changed row's continuous horizontal extent,
including gaps and wide followers, at fixed intensity. It moves with the action
and disappears without fading. Input immediately reveals committed content; subsequent content or
document changes discard stale projections. Offscreen writes retain only the
location hint, and locating one highlights current content without replaying it.
Viewport capture is capped at 32,768 cells and sweep masks at 4,096 units;
larger projections display committed content immediately.

[`activityBadges.ts`](../src/activityBadges.ts) projects offscreen regions onto
canvas edges and separates colliding controls around floating tools. Recent
positions expire after ten seconds; their expiry timer does not hold the animation
clock alive after the fill ends. Clicking a badge changes only the viewport and
highlights the current area. Content-version changes invalidate the position;
inbox entries do not retain or replay it.

## Rebuild the artifact

Ordinary CLI/demo builds copy the checked-in `src/tachyonfx.wasm` and license
notices; consumers and JavaScript CI do not need Rust. To rebuild with Rust and
the `wasm32-unknown-unknown` standard library installed, use the terminal
package's [`build:effects`](../package.json) script. It builds with `--locked`,
copies the artifact and regenerates [`THIRD-PARTY-LICENSES.txt`](THIRD-PARTY-LICENSES.txt).
The bridge supplies elapsed time, so no host clock or JavaScript imports are needed.

## Verification

- [Real WASM pulse timing, ownership and capacity](../../../examples/terminal-canvas/src/tachyonfx.test.ts).
- [IPC-to-native read/write rendering, Unicode, input interruption and invalidation](../../../examples/terminal-canvas/src/readEffects.test.ts).
- [Whole-grapheme transitions, precise changes, continuous feedback and clipping](../../../examples/terminal-canvas/src/mutationPresentation.test.ts).
- [Directional placement, collisions, narrow views and distant regions](../../../examples/terminal-canvas/src/activityBadges.test.ts).
