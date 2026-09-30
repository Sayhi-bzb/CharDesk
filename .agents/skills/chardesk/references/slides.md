# Slide documents

A Slide is one visual moment in a sequence. Each page advances the thought
inside the document's established scene.

Create one native `.chardesk` document:

````text
---
chardesk: document/v1
mode: slide
title: Product overview
---
## Opening

```chargraph
# Product overview
```

## Closing

```text
Thank you.
```
````

Each level-two heading
names a page; source order defines sequence. A page fence selects its rendering
language. Omitted size uses 100×27 Cells; `size=auto` fits content and
`size=80x24` requests a fixed frame.
Page content uses [materials](materials.md). Live Canvas tools edit the current
native Slide page, not its original file.
