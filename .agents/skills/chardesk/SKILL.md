---
name: chardesk
description: Shape CharDesk Canvas, Blackboards, and Slides as real working scenes; create, edit, inspect, or render them through local or live tools.
---

# CharDesk

Every visual workspace belongs to a real working situation. Let the subject
reveal whose surface this is, what is happening, and which traces matter.
Compose from inside that situation and keep it implicit. User direction and the
existing document establish the scene when present.

For source-backed documents, canonical source is authoritative and Canvas is its
projection. For an editable Freeform Canvas or native Slide page, Cell content
is authoritative.

## Surfaces

- A `blackboard.yaml` or Blackboard package uses
  [`references/blackboard.md`](references/blackboard.md).
- A Slide source or deliverable uses
  [`references/slides.md`](references/slides.md).
- Creating, editing, or visually restructuring content uses the available
  [`materials`](references/materials.md).

Keep the requested target and its document contract. New unspecified documents
default to a Blackboard package; do not create one to replace an existing Canvas.
A standalone `.chardesk` remains a supported Freeform Canvas input.

## Backstage

- Local paths, Slide source packages, and artifacts use
  [`references/backstage/cli.md`](references/backstage/cli.md).
- Reading or editing an existing live Canvas or current Slide page uses
  [`references/backstage/live-canvas.md`](references/backstage/live-canvas.md)
  when `chardesk_canvas_read` or `chardesk_canvas_write` is available.
- A Blackboard workspace ID or URL uses
  [`references/backstage/live-workspace.md`](references/backstage/live-workspace.md)
  when `chardesk_blackboard_*` tools are available.
- With no explicit target for an edit, stay on the current live surface. For a
  new unspecified document, prefer available Blackboard tools; otherwise use the CLI.
- If a requested live operation has no suitable tools, read
  [`references/backstage/experimental-live.md`](references/backstage/experimental-live.md).

## Delivery

Complete the required Agent actions. Hand off the result and only UI permission
or restart actions that require the human.
