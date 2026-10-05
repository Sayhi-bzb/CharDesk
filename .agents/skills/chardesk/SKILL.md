---
name: chardesk
description: Use CharDesk when work belongs on a shared spatial Canvas or Slide scene that humans and agents need to inspect, compose, or edit together.
---

# CharDesk

CharDesk is the shared spatial workspace between humans and agents. It turns
generated material, structured findings, and visual composition into a readable
Canvas or Slide scene that both sides can inspect and edit. The rendered Cell
surface is the working result; user direction and the existing document
establish the scene, so stay on the requested target.

Use CharDesk when the task benefits from spatial organization, visible
composition, or a persistent shared scene—when relationships, placement, or
simultaneous inspection matter and the result should be read as a surface
rather than as a one-dimensional file. Use ordinary file or shell tools when
the task is only to generate or transform source material; pass an existing
artifact into Canvas by reference when it is ready for projection.

Editable Freeform and native Slide pages own rendered Cell content. A local CLI
preview is read-only and its native file remains authoritative. Canvas writes
render input into Cells; Markdown and ANSI are input materials, not retained
source documents.

## Routing

- Create or style content with [materials](references/materials.md).
- Read, search, or edit the current live surface with
  [Canvas tools](references/live-canvas.md).
- Create local artifacts or edit existing files with the [CLI](references/cli.md).
- Sequence native Slide pages with [Slides](references/slides.md).
- Discover or repair tool access with [connections](references/connections.md).

Stay on the requested target. New local documents default to one Freeform
`.chardesk` file. Do not create Blackboard packages or substitute a new Canvas
for a requested edit.

## Delivery

Perform available Agent actions. Hand off the result and only permission or
restart actions that require the human.
