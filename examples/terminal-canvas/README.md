# Terminal Unicode Canvas demo

An OpenTUI host over CharDesk's shared headless editor core. Edit Unicode
at positive or negative coordinates, select and move rectangles, undo/redo, and
manage multiple native Freeform `.chardesk` documents with search, anchors and crash recovery.

[Adoption roadmap](ROADMAP.md) owns milestone status.

Requires **Bun ≥1.3.14** and a UTF-8 terminal. From this directory:

```sh
npm install # from the repository root
bun run start
bun run start /path/to/diagram.chardesk
bun run start /path/to/new.chardesk --blank
bun run start /path/to/diagram.chardesk --paste-mode plain
bun run start first.chardesk second.chardesk --workspace /path/to/workspace.json
```

No filename restores the local workspace, or creates a managed blank canvas on
first use. New canvases need no filename. Explicit paths register external files
and keep saving in place; missing paths start empty. A known legacy
`terminal-canvas.chardesk` is registered on first startup. `--blank` remains
accepted and suppresses the welcome content in read-only snapshots.
`F1` lists controls; arrows scroll help. All TUI interface text is English.
Changes save automatically; closing a canvas or quitting waits for disk writes.
[Local storage and recovery](WORKSPACE.md) owns directories, overrides, migration,
concurrency and recovery guarantees.

The demo opens in **Hand**. The header contains Settings, Minimap and Sessions;
the footer Dock contains Edit, Hand and Style. Click any control. Tab/Shift+Tab cycles only the footer Edit, Hand and Style
controls; Enter/Space activates the focused control. Settings, Minimap, Sessions, Edit and Hand
have no default direct shortcuts; Settings can assign them. Drawing tools are explicit choices within
Edit; choose Dock Edit to return to text/selection.

| Control                                                       | Action                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Option+arrows (Alt on Windows)                                | Pan by configured step (default 10) in either tool               |
| Left-drag in Hand                                             | Pan both axes; preserve selection and history                    |
| Click in Edit                                                 | Place cursor, then type immediately                              |
| Option(Alt)+click / Shift+click / Shift+arrows / drag in Edit | Extend / select a rectangle                                      |
| Drag an existing range                                        | Preview movement; release to commit                              |
| Click inside an existing range                                | Collapse selection and place cursor                              |
| Type one character in a range                                 | Fill the selected range                                          |
| Arrows / Ctrl+arrows in Edit                                  | Move cursor / selected range                                     |
| Esc                                                           | Cancel live drag first, otherwise clear selection; keep the tool |
| Enter in Edit                                                 | Newline                                                          |
| Tab / Shift+Tab                                               | Focus next / previous footer Edit, Hand or Style control         |
| Enter / Space with control focus                              | Run focused button                                               |
| Esc with control focus                                        | Return to canvas; preserve selection                             |
| Delete / Backspace in Edit                                    | Erase a complete grapheme or selection                           |
| Header Minimap                                                | Toggle Minimap without changing tools                            |
| Home / F5                                                     | Go to origin / locate content                                    |
| F1                                                            | Help with platform-specific shortcuts                            |
| Right-click / Shift+F10                                       | Open the canvas action menu                                      |
| Ctrl+Q                                                        | Automatically save all documents and quit                        |

All printable letters, including `i/h/m/I/H/M`, are text in Edit while the canvas
has focus. Header/footer control focus consumes typing and paste; clicking the canvas returns focus.
Entering control focus starts on the current Edit / Hand button (New with no canvas); subsequent presses
move forward or backward. Without a visible tool button, entry uses the first
or last available button for that direction.
Tab no longer inserts a tab stop; pasted tabs retain their text behavior.
Control focus is transient Host state and is not saved in documents or recovery views.
Click, Escape,
undo and paste keep the selected tool. Clipboard paste works in either tool and
selects its result. Help, focus loss, resize and tool changes cancel active drags.

### Range input

In Edit text/selection, ordinary click sets the anchor; Option(Alt)+click extends or
shrinks the same primary range. Shift+click uses the same behavior where the
terminal forwards it; Shift+arrows extend from the keyboard. Ctrl+click appends a
disjoint range. Hand and drawing tools retain their own behavior. See [native
input regressions](src/range-input.test.ts).

Warp's [mouse encoder](https://github.com/warpdotdev/warp/blob/master/crates/warp_terminal/src/model/escape_sequences.rs)
omits modifier bits. On `TERM_PROGRAM=WarpTerminal`, the
[input adapter](src/inputModifiers.ts) requests all Kitty key events plus associated
text and merges independently reported held modifiers with mouse packets.
Press/release lifetimes stay outside document state and reset on blur, resize and
control disposal. [Reporting tests](src/inputModifiers.test.ts) and the bare-mouse
cases in [native input tests](src/range-input.test.ts) verify this path and text input.
Option+click has been verified on Warp with standalone modifier events. Shift combinations
still cannot reach the app because Warp intercepts those mouse events entirely.

| Action      | macOS        | Windows               |
| ----------- | ------------ | --------------------- |
| Copy        | ⌘C or Ctrl+Y | Ctrl+C                |
| Cut / Paste | ⌘X / ⌘V      | Ctrl+X / Ctrl+V       |
| Select all  | ⌘A           | Ctrl+A                |
| Undo        | ⌘Z           | Ctrl+Z                |
| Redo        | ⌘⇧Z          | Ctrl+Y / Ctrl+Shift+Z |

[`shortcuts.ts`](src/shortcuts.ts) owns binding and display policy. macOS keeps
Command editing bindings and adds the [Vibe-style Ctrl+Y copy fallback](https://docs.mistral.ai/vibe/code/cli/commands-shortcuts).
Context-menu Copy runs the same command as the shortcuts, preserves the range
and follows user rebindings.
Command+Q remains reserved for the terminal application. Extended Command events
are requested through Kitty keyboard reporting; terminal-owned shortcuts must be
forwarded to the application to operate on its logical canvas selection.

In Warp, enable **Mouse Reporting** under Settings → Features → Terminal to
receive pointer input. Hand uses ordinary mouse drag events and needs no
keyboard-release protocol or system helper.

### Terminal input policy

[`terminalPolicy.ts`](src/terminalPolicy.ts) selects documented behavior from the
environment and later OpenTUI terminal identity replies. Kitty keyboard support
alone does not establish Command or mouse forwarding. Help and effective shortcuts
follow that policy; user shortcut overrides remain authoritative.

| Terminal path                   | Shift+click                                                                                                                                   | Copy on macOS                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Ghostty                  | Requests [`XTSHIFTESCAPE`](https://ghostty.org/docs/vt/csi/xtshiftescape) through the native output queue; resets the request on detach/exit. | ⌘C when terminal bindings forward it; Ctrl+Y or context-menu Copy otherwise.                                                                                                                                              |
| Kitty                           | Uses forwarded mouse events; no Ghostty-specific request.                                                                                     | Default [`copy_or_noop`](https://sw.kovidgoyal.net/kitty/actions/#copy_or_noop) forwards ⌘C when Kitty has no native selection; Ctrl+Y remains available.                                                                 |
| Warp                            | [Shift+mouse belongs to Warp](https://docs.warp.dev/terminal/more-features/full-screen-apps/). Use Option+click or Shift+arrows in Edit.      | Advertises Ctrl+Y; context-menu Copy is also available. [Upstream #15016](https://github.com/warpdotdev/warp/issues/15016) tracks swallowed ⌘C for internal alt-screen selections; the app still accepts ⌘C if forwarded. |
| Unknown terminal or multiplexer | No capture request based only on an outer terminal name. Use drag/Shift+arrows; modified clicks require forwarding.                           | Ctrl+Y / context-menu Copy avoid dependence on Command encoding.                                                                                                                                                          |

For Ghostty, an optional user configuration lets terminal Copy yield when there
is no terminal-owned selection ([`performable:` contract](https://ghostty.org/docs/config/keybind#performable)):

```ini
keybind = performable:super+c=copy_to_clipboard
```

CharDesk does not edit terminal configuration. Ghostty's
[`mouse-shift-capture`](https://ghostty.org/docs/config/reference#mouse-shift-capture)
`never` override can refuse the application's request. `requested` means output
was queued, not that the user configuration granted capture. The
[policy regressions](src/terminalPolicy.test.ts) cover late identity, multiplexer
boundaries, refused output and request cleanup; [native input regressions](src/surface.test.ts)
cover Copy fallback routing and user rebindings. These are protocol tests,
not evidence of physical Ghostty or Warp forwarding.

If Option+↑/↓ does not reach the canvas, check Settings → Keyboard shortcuts:
Warp assigns these keys to **Select the Closest Bookmark Up/Down** by default.
Clear or remap those actions before retesting; see [Warp's shortcut reference](https://docs.warp.dev/getting-started/keyboard-shortcuts).
The [native keyboard tests](src/surface.test.ts) cover all four pan directions
under legacy and Kitty reporting; they do not verify a terminal's shortcut forwarding.

For actual-terminal evidence, set `CHARDESK_TRACE_INPUT=/tmp/chardesk-input.jsonl`
when starting the demo. The path must not exist. The opt-in trace records navigation
escape sequences, parsed modifiers, tool, gesture, cursor, range and viewport;
document text, printable key names and paste payloads are omitted. Select Dock Edit, then use ordinary
click, Shift+click, Shift+Right and Option+arrows, then quit. Compare input records
with state changes; simulated tests alone cannot prove host forwarding.

### Export and rich clipboard

Shift+F7 opens Export in the shared dialog; choose Canvas/Selection and TXT,
ANSI, CharDesk or PNG, then enter a **new file path**. Export captures content
before platform IO and never
changes the document path, selection, history or saved baseline. Existing paths
(including symlinks) are refused atomically; errors keep the path prompt open.

Canvas TXT/ANSI/PNG export the active page; Canvas CharDesk preserves the full
native document. Selection exports preserve coordinates and complete wide glyphs,
exclude content in range holes, and include only selected text anchors in native
files. PNG excludes canvas UI, uses the bundled export font and terminal RGB
colors, and reports unavailable colors or excessive size. Empty documents can
export text/native files; an empty canvas has no PNG. The shared
[preparation contract](../../packages/editor-core/README.md#export-preparation)
owns budgets and range policies; [native dialog/file tests](src/export.test.ts)
cover delivery and state retention.

Local Copy/Cut write plain text and a portable CharDesk HTML representation in
**one** [`ClipboardManager.setContents`](https://github.com/Teddy-Zhu/node-clipboard-rs)
call. Web reads/writes the same carrier alongside its existing custom MIME.
Styles, backgrounds, links and wide glyphs bypass text recompilation on Paste.
Malformed/ordinary HTML falls through to the text preparation pipeline.
[Transport tests](src/clipboard.test.ts) and
[Web interoperability tests](../../apps/canvas/src/domains/actions/adapters/clipboardActions.dom.test.ts)
verify this with injected backends, without touching the test machine clipboard.

Remote/WSL sessions never use a server native rich clipboard. Unavailable native
backends fall back to plain text with an explicit status; ANSI copy remains an
explicit alternative. OSC 52 dispatch still cannot confirm clipboard acceptance,
so Cut retains its source. Native library availability does not establish shortcut
forwarding or actual OS interoperability; see [Host limits](#verification-and-limits).

### Context menu

Right-click opens the canvas menu when the terminal forwards that event.
Shift+F10 opens the same overlay. Opening is rebindable;
labels follow the effective keymap. Arrows/Tab select enabled items, Enter runs
one command, Esc closes. An outside click closes without editing the canvas.

Right-click inside physical selection coverage preserves that range. Outside it,
the clicked grapheme becomes the cursor and the old range clears, without
switching tools. Keyboard opening uses the range start or cursor. The
menu retains the [Web editing actions](../../apps/canvas/src/domains/actions/core/catalog.ts):
Copy as Text, Copy as ANSI, Snapshot (PNG), Paste and Delete. Cut, Select all
and Undo/Redo remain keyboard commands. Opening links remains the [terminal gesture](#links).

ANSI uses the shared clipboard formatter. PNG copies an image through the native
[Arboard binding](https://github.com/Brooooooklyn/Clipboard), using the shared Canvas
cell renderer and bundled Web font subsets. It includes only the selected graphemes,
with one-cell padding and no cursor, range decoration or grid. Raster colors are
queried from the terminal; an unavailable palette reports failure. PNG clipboard
copy is disabled for remote/WSL sessions; text copy retains its terminal fallback.

[`contextMenu.ts`](src/contextMenu.ts) owns transient target/focus/layout state;
[`controller.ts`](src/controller.ts) registers command availability and execution.
Menu, keyboard and toolbar actions use the existing command registry and
clipboard acknowledgement contract. A known unavailable clipboard read disables
menu Paste; close the menu to use terminal paste. Unknown clipboard availability
is handled by the existing operation result, without reading the clipboard when
opening the menu.

Opening cancels unfinished gestures and pending clipboard mutations. Document,
page, tool, selection or content changes close stale menus; blur, resize and
disposal also close them. The overlay consumes canvas keys, paste and pointer
events while open, masks underlying hyperlinks and hides the canvas cursor.
[Native menu regressions](src/contextMenu.test.ts) cover entry points, targeting,
availability, history, asynchronous Cut, input isolation, rebindings and narrow layouts.
These tests do not prove a terminal forwards physical right-clicks.

### Links

Markdown/ANSI document links render underlined with OSC 8 metadata through
OpenTUI's [native styled text](https://opentui.com/docs/core-concepts/text-and-cells/).
Use the terminal's open-link gesture; [Warp uses ⌘+click on macOS](https://docs.warp.dev/terminal/more-features/files-and-links#osc-8-hyperlinks).
Ordinary clicks retain Edit/Hand behavior. Selection, wide-glyph followers,
viewport clipping and placement previews retain their link targets.

OpenTUI's default hyperlink detection omits Warp. On a direct Warp terminal,
[`terminalRendererEnvironment`](src/terminalPolicy.ts) supplies the library's
[public `FORCE_HYPERLINK` override](https://opentui.com/docs/reference/terminal-capabilities/#overrides)
before renderer creation. An explicit user value (including `0`, `false` or
`off`) wins; an outer Warp name alone does not enable links through a multiplexer.
Local Web canvas URLs such as `http://localhost:5195/unicode-airport` open as
ordinary browser URLs, rather than as navigation inside the terminal canvas.

[`linkText.ts`](src/linkText.ts) owns visible text-run resources; OpenTUI owns URL
allocation, OSC 8 encoding and capability gating. A terminal without hyperlink
support still displays the labels. URLs exceeding OpenTUI's
[512-byte slot limit](https://opentui.com/docs/reference/terminal-capabilities/)
remain in the document but may have no terminal hyperlink. [Native regressions](src/links.test.ts)
cover URL hit metadata, selection, clipping, overlays, deletion and undo; they do
not launch a browser or establish physical terminal click behavior.

### Drawing, characters and templates

| Control          | Action                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Shift+F2         | Drawing tools: text/selection, brush, eraser, text recolor, box, split box, elbow/step line, circle and background |
| Shift+F3         | Character library: essentials, Nerd Font, Emoji and Unicode                                                        |
| Shift+F4         | Template/component catalog                                                                                         |
| Dock Edit / Hand | Return to text editing / Hand                                                                                      |

In the tools panel, C sets one brush grapheme, L chooses it from the library,
F sets foreground and B sets background (`#RRGGBB`). These are panel actions;
printable tool letters remain text on the canvas. Background paint preserves the
existing glyph. Recolor changes existing glyphs inside a dragged rectangle.
A stroke previews without changing content; release commits one undoable write.
Escape, focus loss, resize and document changes cancel a live gesture.

The character picker searches names, aliases and code points. F10 changes pack,
F11 selects groups or Unicode block/script/category facets, F5/F6 page, and F9
retries resource failures. Enter or click selects a character, then chooses
insertion/selection fill or a brush glyph. Non-insertable Unicode controls remain
visible and cannot be inserted. Data ships with the terminal build; no Web server
is needed and resource paths do not depend on the launch directory.

In the template picker, type to filter and use F10 to change group. Enter or click
opens a canvas preview. Arrows or pointer movement position it; Shift+arrows move
10 cells. Option+arrows use the configured pan step. Enter / the dock Place button confirms; Escape / Cancel discards.
Insertion writes only the template spans and preserves unrelated content.
Adaptive templates use terminal foreground/background defaults; identity templates
retain their explicit document colors. Previews do not enter autosave or recovery.

[Shared drawing](../../packages/editor-core/README.md),
[character data](../../packages/character-library/README.md) and
[templates](../../packages/canvas-templates/README.md) own their contracts.

### Workspace controls

| Control           | Action                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Header Sessions   | Persistent session list                                                |
| F6 / Shift+F6     | Next / previous open canvas                                            |
| ⌘O / Ctrl+O / F10 | Open an external path                                                  |
| ⌘N / Ctrl+N       | New managed canvas without a path prompt                               |
| ⌘W / Ctrl+W       | Save and close current canvas; keep its session                        |
| ⌘F / Ctrl+F       | Search current page; F10 toggles RE2, F11 toggles case folding         |
| ⌘G / Ctrl+G       | Next search match                                                      |
| F9                | Anchor tree; N adds, R renames, T reattaches at cursor, Delete removes |
| Shift+F9          | Add anchor at cursor                                                   |

F8 remains a fallback for Find when the terminal consumes the platform shortcut.
Warp lists macOS ⌘F as its own [Find action](https://docs.warp.dev/getting-started/keyboard-shortcuts/);
terminal bindings determine whether that key reaches CharDesk.

The Sessions list contains only session records; clickable footer actions create
a canvas (N) or open a file (O), including when either list is empty.
R renames the local alias, D duplicates,
A archives/restores, Delete closes an open canvas, and X reviews removal. Removal
can keep the file or delete an owned managed file; external files are always kept.
See the [removal/recovery contract](WORKSPACE.md#removing-sessions).
Sessions uses the same dialog
shell as Settings: Tab / Shift+Tab or clicking a tab switches Canvases / Archived;
F10 also switches lists. Escape or clicking outside closes it. F5 refreshes metadata
from other instances. Enter reopens a session, including
an archived one. Closing the last canvas returns to Sessions; archiving keeps its
file. Duplicate creates an independent managed canvas with current unsaved content.

Enter or click chooses a result; Escape dismisses a panel. Search/anchor navigation
moves the camera and preserves cursor, selection, content and undo history.
Panels consume text and paste so prompts do not edit the canvas. Each document
retains its tool, view, interaction, dirty status and undo history while open.

### Source

Shift+F12 opens Source for the current native document. In Sessions, S opens the
selected canvas and its Source panel. Check changes reads without editing; Reload
reads the external native document while retaining the view. Local edits block
replacement; **Preserve local copy and reload** creates an independent managed
canvas first. A failed save exposes **Retry saving local changes** after the
conflict is resolved. External updates, missing paths and unreadable files appear
in the footer and never silently overwrite the canvas.

The [source lifecycle contract](WORKSPACE.md#native-file-sources) owns baselines,
reload/cancellation and view/history behavior. Text compilation and Auto Paste
remain separate from native-file reloading.

### Status bar

The header occupies one terminal row; the canvas starts immediately below it.
The footer's first row contains the Dock or one surface title with essential commands.
Selected tabs and detailed shortcut instructions are not repeated; F1 owns the full guide.
The second row carries operation feedback and errors. Closing an overlay restores the Dock.
Full-screen panels such as Find cover the terminal from the top-left edge to the
footer, without retaining an empty header row or canvas margins.
Header and footer drawing, focus and hit-testing use the same control geometry, including after resize.

### Selection and navigation

Press **Shift+F8** for the shared dialog listing every navigation command and its
current binding. Enter or click runs it. **Shift+Space / Ctrl+Space** select a
row / column when forwarded. Selection bounds include existing content, the active
cell and current ranges; they remain finite on an empty canvas. Wide glyph coverage
can differ by row, including when a column hits a follower cell.

**Ctrl+Home / End** moves to the left / right bound; **Ctrl+End** moves to the
bottom-right bound. Shift extends these movements; Ctrl+Shift+Home extends to the
top-left bound. Home retains Go to origin. PageUp / PageDown moves one visible
canvas height; Shift extends and reveals the moving extent. On macOS, Command+
arrows jump between content runs; Windows uses Ctrl+Alt+arrows. Shift extends.
Option/Alt+arrows retains pan. The dialog provides all operations when terminal
bindings intercept a shortcut, including move to the top-left bound.

Navigation preserves content, tool and undo history. Sparse content jumps use
occupied intervals, and CellPlane visits use the sparse chunk directory. Viewport
coverage and point hit tests clip before expanding rows, so selecting a column
across distant content does not allocate the intervening rows. Full materialized
editing operations have a one-million-cell work budget and fail before writing;
style edits have the smaller [shared style budget](../../packages/editor-core/src/selection/style.ts).

Verification: [shared rules](../../packages/editor-core/src/selection/navigation.test.ts),
[Web/TUI parity](../../apps/canvas/src/app/selectionNavigationParity.dom.test.ts),
[native keys, dialog and sparse selection](src/workspaceControls.test.ts).

### Style toolbar

Style starts expanded without taking keyboard focus or changing the active tool.
Click **Style** in the footer Dock to toggle the floating toolbar;
**Shift+F11** remains its rebindable keyboard shortcut. It leaves the viewport size intact.
Canvas clicks, typing, paste and captured drags keep working while it stays open.
Mouse attribute changes return input to the canvas. Keyboard opening focuses its
controls: arrows / Tab select, Enter changes, and Esc returns to the canvas without
clearing the range. Unfocused Esc keeps normal canvas behavior. Tool changes keep
the toolbar open and cancel color input; modal panels temporarily hide it. Small
terminals collapse it to a label while canvas editing remains available.

The two rows contain **B / I / U / S / Inv** and **Text / Fill / Clear**. Buttons
retain pressed/focused/disabled styling, with no status labels, color readout or
selection count. Shared rules still turn a mixed attribute on. Text and Fill open
a foreground/background color palette. Click a swatch to apply it; use the header
to switch between Web's ANSI16 RGB colors and 40 curated presets, enter custom HEX,
or reset. Curated colors follow the reported terminal light/dark appearance
(unknown uses light); switching appearance does not recolor authored cells.
The [shared palette data](../../packages/ui/README.md) has no React dependency.
Swatches occupy two columns and one row each, with one-cell horizontal gaps and no vertical gaps
between unselected colors. Only the active swatch has brackets around both RGB cells;
the palette uses no native cursor overlay. Palette buttons keep brackets and wrap
to keep the popup narrow.

Arrows choose a swatch, Enter applies, Tab switches palettes, H opens HEX and R
resets. Short terminals scroll rows as keyboard focus moves. Terminal paste and
clipboard shortcuts enter the custom color input without editing the canvas.
In HEX, Enter applies `#RRGGBB`. Esc cancels, and clicking the canvas cancels and immediately
targets that cell. Empty resets foreground to the document default or removes
background. Clear background removes background-only blank cells. An empty range
can receive background; text attributes require existing cells.

**⌘B / Ctrl+B**, **⌘I / Ctrl+I**, **⌘U / Ctrl+U** and **⌘⇧X / Ctrl+Shift+X**
provide formatting commands when forwarded by the terminal. Style is also
available through its rebindable command and dock. Each operation is one undo
step and preserves selection, view, other attributes and links. Changed color
inputs cannot apply to a newer selection. Blur, resize, document/page changes and
disposal cancel color input and its pending clipboard edits. Large selections
report a size limit. [`inspector.ts`](src/inspector.ts) owns floating presentation
and input focus independently of modal workspace panels.

[Shared style rules](../../packages/editor-core/src/selection/style.ts),
[Web/TUI parity](../../apps/canvas/src/app/selectionStyleParity.dom.test.ts) and
[native Style tests](src/inspector.test.ts) own behavior and verification.

### Continuous edge scrolling

In Edit, hold a selection drag or a moved range within two cells of a canvas edge.
After 250 ms, the viewport scrolls continuously, including both axes at corners.
Moving into the center pauses it. Selection and range previews follow the shared
pointer commands; moving content still commits once on release. Hand and drawing
gestures do not trigger this behavior. One document cell remains one terminal cell.

Web and TUI share [delay, acceleration and eligibility](../../packages/editor-core/src/interaction/edgeScroll.ts).
The [terminal adapter](src/edgeScroll.ts) accumulates fractional velocity into
integer cells; [native regressions](src/edgeScroll.test.ts) cover stationary holds,
wide ranges, release, cancellation and lifecycle cleanup.

Release, Esc, tool/history/page changes, overlays, Dock navigation, reported blur,
resize, mouse-reporting disable and disposal stop the active scroll. A subsequent
no-button move also cancels a missed release. OpenTUI delivers captured drag events
and focus/blur only when the terminal reports them ([interaction contract](https://opentui.com/docs/core-concepts/interaction/)).
A release outside the terminal with no subsequent report cannot be observed;
press Esc before continuing. There is no inactivity timeout while holding an edge.

When mouse reporting or modifier forwarding is unavailable, Shift+arrows and the
[Navigation dialog](#selection-and-navigation) provide selection, Ctrl+arrows move
a range, and Option/Alt+arrows pan. Terminal configuration can suppress mouse
reports ([Ghostty policy](https://ghostty.org/docs/config/reference#mouse-reporting));
capability requests cannot override it. Controlled native tests and PTY checks do
not establish physical Warp/Ghostty forwarding.

### Settings

Choose **Settings** in the header. Inside the dialog, Tab / Shift+Tab
switches sections; ↑↓ selects a row; ←→, Enter or clicking a row changes its value.
Escape or clicking outside closes the dialog. Existing pickers keep their local F11 actions.

Appearance configures **Language** (Follow system / 简体中文 / English), the native
cursor shape/blink and terminal palette selection background (see [appearance behavior](#terminal-appearance)); Navigation configures the pan step; Paste configures format detection.
Shortcuts searches the shared command/keymap catalog. Enter edits a binding;
F5 records a replacement of up to two strokes, Enter saves, and Esc cancels.
Bindings can also be typed; use `/` between alternatives and a space between
sequence strokes. Save checks exact and prefix conflicts against the proposed
catalog. Disable, restore one action, or restore all defaults in the same panel.
Recording retains physical Control/Option/Command; it does not prove the terminal
will forward that binding. Blur/resize cancels recording. Terminal paste can fill
the search or binding field; recording consumes it without modifying the canvas.

Rendering configures prose wrap (60–200 cells), automatic heading anchors,
Markdown feature toggles, and separate light/dark semantic and feature colors.
Empty color fields follow the theme. Preferences affect the next render/paste;
existing authored cells stay intact. Defaults inherit the terminal foreground;
explicit generated colors remain authored colors. Screen fonts/size belong to
the terminal; [PNG export](#export-and-rich-clipboard) keeps its export font policy.

Language changes update the interface immediately and persist with the other
preferences. Follow system resolves `LC_ALL`, then `LC_MESSAGES`, then `LANG`,
falling back to the runtime locale; Chinese locales use Simplified Chinese and
other locales use English. Document names, template/resource labels and authored
content retain their source text. [`i18n.ts`](src/i18n.ts) owns locale resolution
and per-host translation; [`i18n.test.ts`](src/i18n.test.ts) verifies switching,
persistence, native layout/hit testing and content isolation.

Changes stay independent of document content and undo history. Each section has
a reset action. The panel owns keyboard, pointer and paste input.

Preferences use the [application configuration directory](WORKSPACE.md#application-directories).
`--settings <path>` chooses another file. An explicit `--paste-mode` overrides the saved paste format
for that session; changing Paste settings saves the new choice. Unreadable, invalid
or newer-version files remain untouched; the panel reports session-only changes.
Write failures retain the live values and appear in the panel.

[`settings.ts`](src/settings.ts) owns the versioned preferences and setting definitions;
[`settingsDialog.ts`](src/settingsDialog.ts) adapts them to the shared panel shell.
Shortcut persistence and dispatch use the existing EditorKeymap, including
unknown-owner overrides. The [shared CharGraph profile](../../packages/chargraph/README.md)
owns rendering definitions and validation; Paste format remains the single TUI
mode preference. Verification: [persistence](src/settings.test.ts),
[modal interaction](src/settingsDialog.test.ts), [shortcut lifecycle](src/keymapSettings.test.ts)
and [rendering/configuration](src/textSettings.test.ts).

### Terminal appearance

The Host follows terminal colors. [`TerminalAppearanceRuntime`](src/appearance.ts)
owns one snapshot and revision for native colors, cursor preferences, content
colors and resolved RGB. Canvas, menus, panels and Minimap consume its semantic
roles. Default text uses the shared [artifact foreground rule](../../packages/cell-plane/src/artifact-style.ts);
literal document colors and explicit backgrounds remain unchanged.

**Terminal + Settings**\
　↓ [OpenTUI attachment](src/appearanceHost.ts)\
**Appearance snapshot + revision**\
　├→ Screen: native default / ANSI references\
　├→ Paste and template preview: content colors\
　└→ PNG: resolved RGB captured for the operation

Startup, OpenTUI `theme_mode` events and focus restoration refresh the palette.
`palette` events also publish changes within the same light/dark mode. The
attachment uses OpenTUI's public cache/query API; old query results cannot replace
newer state. Some terminals do not report theme changes: use **Settings → Appearance
→ Refresh terminal colors** to refresh explicitly. Theme detection may remain
unknown; screen drawing does not depend on RGB detection succeeding.

New settings default selection background to **Auto contrast**, choosing an ANSI
slot from the terminal palette. Explicit gray/blue/cyan choices and existing saved
choices remain authoritative. Borders and the Minimap viewport outline adapt to available contrast.
Document text keeps its own foreground even inside a selection; uniform coverage
includes wide-character followers and empty cells.

Paste captures the appearance before compiling through the shared Markdown theme
builder. Without terminal RGB, semantic styles inherit the canonical foreground,
retain attributes and report a diagnostic. Authored ANSI/native documents retain
their colors. Template previews follow appearance until placement; insertion
materializes that preview's colors in one undoable write. Existing generated
content is never recolored by a later Host theme change.

PNG captures resolved terminal foreground/background and checks the appearance
revision before clipboard delivery. Unavailable RGB fails explicitly. Appearance
state, queries and refreshes never modify document, selection, history or saved
preferences; Settings saves only user choices. Opt-in input traces record appearance
revision/mode/status, without palette values or OSC payloads.

Verification: [runtime and native frames](src/appearance.test.ts),
[template preview lifecycle](src/workspaceControls.test.ts),
[PNG delivery guards](src/contextMenu.test.ts). Real terminal notification and color
behavior still require validation on each target terminal.

### Floating Minimap

Choose **Minimap** in the header in either tool to toggle a 28×10 floating map at the bottom right.
The viewport stays the same size. The shared minimap contract decomposes `▀` / `▄`
into upper/lower foreground/background coverage; `█` uses its foreground.
Other characters retain background priority, with inherited foreground following
terminal colors. Plain spaces remain empty; background-colored spaces and complete
wide glyphs contribute their occupied area.

The TUI samples twice vertically per terminal row and encodes the two colors with
`▀`, `▄` or `█`, rather than drawing the same lower-half marker everywhere.
The current viewport tints both preview halves without covering them with border
glyphs. RGB paints shift toward contrasting terminal foreground/background; when
those colors are unknown, literal RGB uses a contrast adjustment and unresolved
native foreground uses terminal dimming. Empty viewport cells retain the native
background fill. Original document colors remain unchanged.
Click outside the rectangle to center the view;
drag inside it to pan while preserving the grab offset. Navigation preserves
cursor, selection, tool, content and undo history. The overlay consumes pointer
input, including its border, so clicks never edit the canvas underneath.

Like Web, the map fits the union of visible content and the viewport and updates
that transform during navigation. Plain spaces do not set content bounds;
background-colored spaces do. When colors collapse into one half-cell sample, the
greatest accumulated projected area wins; ties use stable color-key order.
Equal default/authored RGB are combined when the terminal foreground is known.
Content spans are cached by reader and revision; camera changes reproject them,
and repeated frames reuse the color raster. Theme changes refresh default color
without rescanning document cells. Logical geometry is shared with Web in
`@chardesk/editor-core/minimap/geometry`; terminal drawing assumes rows are twice
as tall as columns. Empty maps show an empty state. Below 60 columns or 18 rows,
the map hides with a size hint and returns when space is available. Resize, focus
loss, help and toggling cancel active drags. Edit keeps `m` as text.

The [shared content contract](../../packages/editor-core/src/minimap/content.ts)
owns occupancy and color inheritance for both Hosts. Verification:
[native colors, collisions, cache and navigation](src/minimap.test.ts),
[shared semantics](../../packages/editor-core/src/minimap/content.test.ts), and
[Web incremental rendering](../../apps/canvas/src/widgets/canvas-editor/minimap/MinimapManager.dom.test.ts).

## What is shared?

### Text input

System clipboard paste and terminal bracketed paste use the same asynchronous
preparation and commit workflow. The default Auto detect paste format uses
[`@chardesk/chargraph`](../../packages/chargraph/README.md) to detect plain text,
ANSI or Markdown, including Mermaid, math and data-tree extensions. Use `plain`
to preserve source literally, or force `ansi` / `markdown`. Native Freeform
document envelopes are decoded before compilation; unsupported document modes
are rejected without modifying the canvas. Typing remains literal.

Preparation finishes outside mutation transactions. New Cut/Paste requests,
changed edit targets, Escape, document switches, detached controls and disposal
invalidate pending paste. Successful compilation commits one undoable write and
selects its result. Compiler warnings appear in the status line. Headings are
committed as automatic anchors together with pasted content. Tests: [compiler and terminal events](src/text.test.ts),
[shared races](../../packages/editor-core/src/pastePreparation.test.ts).

The runner emits CharGraph's ELK worker alongside the entrypoint. Runtime workers
remain referenced while layout is pending and release the idle process afterward.

### Editing core

[`editor-core`](../../packages/editor-core/README.md) owns editing planners,
interaction transitions, Yjs documents and undo history. The terminal model is
a re-export of `FreeformEditorSession`, composed from the generic `EditorRuntime`.
Web uses that runtime framework and the shared selection, gesture, clipboard,
document and history contracts through its application facade.
[`cell-plane`](../../packages/cell-plane/README.md) owns sparse projection and
native text serialization. There are no imports from Web application internals.

The demo owns mouse adaptation, the OpenTUI presenter and local file I/O.
[`editor-input`](../../packages/editor-input/src/terminal.ts) connects OpenTUI's
keyboard Host to the shared keymap engine and observes asynchronous capabilities.
The [clipboard adapter](src/clipboard.ts) uses OpenTUI's native/OSC 52 service;
remote reads use terminal paste events instead of the server clipboard. This
transport preserves plain text. The shared core owns the
[write acknowledgement and Cut contract](../../packages/editor-core/README.md).
It starts no Web app, collaboration transport or IndexedDB provider. File saves
use the shared document envelope; Slides remain unsupported. Undo history follows
the shared Web implementation rather than a terminal-specific history limit.

The [runner](scripts/run.ts) bundles workspace sources with explicit aliases,
leaving OpenTUI and Yjs external. Install dependencies from the workspace root;
Bun is required to run this host. Root [package.json](../../package.json) owns
shared build and test commands.

## Verification and limits

```sh
bun run test
bun run typecheck
bun run start --snapshot
```

Tests cover sparse negative coordinates, width-aware editing, overlapping moves,
history, file conflicts, native OpenTUI frames, keyboard/mouse input, resize, and
English and Chinese menus and help, both tool states, Command/Ctrl routing, and clipboard transport
contracts. Native clipboard backends still need device validation; tests inject services.
[Host lifetime tests](src/inputHost.test.ts) cover capability updates and reattachment.
Shared tests also verify selection/fill/clipboard parity with Web
and async clipboard failure/cancellation. `--snapshot` prints the first 80×24 document cells and needs no TTY.

- One document cell maps to one terminal cell; navigation uses Hand or Option+arrows.
- On macOS, ordinary Delete is Backspace; Fn+Delete deletes forward. Both delete
  the current range, including a drag whose release event has not arrived.
  [Shared command settling](../../packages/editor-core/README.md) owns that transition.
- Host colors use terminal defaults and ANSI palette entries; selection/search highlights
  use a uniform terminal palette background selected by [Appearance](#terminal-appearance), without inverse.
  The active cell uses only the terminal's native cursor (block by default). Document and link
  underlines remain content styles. Explicit document colors stay in the document.
- If OpenTUI measures a glyph differently from the protocol, the presenter uses
  width-preserving `?` placeholders and reports it. Saving retains original text.
  [Warp's grid advances per code point](https://github.com/warpdotdev/warp/blob/master/app/src/terminal/model/grid/ansi_handler.rs),
  so [renderer policy](src/terminalPolicy.ts) selects OpenTUI's native `wcwidth` mode
  there, preserving explicit user width overrides and multiplexer detection.
  Unsupported joined emoji use placeholders instead of overwriting adjacent UI.
  [Output tests](src/glyphOutput.test.ts) replay native drag diffs into a VT grid;
  frame-buffer captures alone cannot detect terminal cursor drift.
- Files use the shared native document codec: origins, page metadata and anchors
  survive reopen. Version 1 remains readable; version 2 requires an updated Host.
  Styles and links are serialized; [document links](#links) also carry native terminal hyperlink metadata.
- Saves use temporary-file replacement and reject detected external changes.
  Distant sparse content uses coordinate fragments without expanding empty space.
- Input is overwrite-based; this is
  a character canvas, with no paragraph reflow or browser IME composition UI.
- Windows, Linux, SSH, and multiplexer behavior need target-terminal validation.

Keyboard entry and paste preserve complete incoming graphemes; combining marks
and joined Emoji arriving across separate events are joined before projection.
