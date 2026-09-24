# Philosophy

UI as Text is the goal: structure, meaningful state, and available actions should be understandable from text without relying on color or source code. Three Cell-native principles support it.

## Everything is Cell

Layout, paint, hit targets, scrolling, selection, and copy use integer Cells. Visible characters remain Unicode in Cell.text, whether painted by a font or Cell graphics; backgrounds are metadata, not characters. Every visible Cell belongs to a Widget or its chrome, so an outlined Table's borders can be copied and traced to their owner.

[Cell-native design contract](https://github.com/Sayhi-bzb/CharDesk/blob/main/apps/docs/content/docs/development/cell-ui/design.mdx)

## Every Input becomes a Command

Keyboard, pointer, wheel, native text input, and assistive actions reach Widget commands. Keyboard operation is complete; a pointer acts directly on the visible Cell target. Enter and a complete tap on a Button reach the same action, and hover is never required to finish it.

[Explore the visual philosophy](https://ui.chardesk.com/#/guides/classic-macintosh)

## One State, Many Projections

Applications own business values. Focus, selection, press, expansion, disabled, and editing state that affect the interface appear in the committed Cell Scene. Canvas, Semantic DOM, Unicode clipboard, and headless tests consume that Widget commit; a Table can truncate a filename visually while its semantic label keeps the full name. Today, ordinary Cell Range copy preserves visible Unicode, not every color-only state or semantic detail. A complete UI-as-text export is a future projection of the same commit, not a change to ordinary copy.

[See Markdown](https://ui.chardesk.com/#/guides/markdown)
