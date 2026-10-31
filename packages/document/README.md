# @chardesk/document

Portable envelope for canonical UTF-8 `.chardesk` documents.

```text
---
chardesk: document/v1
mode: freeform
title: Example
---
Hello
```

The package owns envelope parsing and serialization only. Mode bodies remain
owned by CharDesk's Freeform, Structured, and Slides codecs.

`document/v2` adds a required JSON `canvas` header for Freeform page metadata.
Its active-page body remains visible-control text. Reading it requires
`parseCharDeskDocumentEnvelope(source, { allowCanvasMetadata: true })` and a
compatible metadata decoder; the default parser rejects it so existing consumers
cannot silently discard metadata. Serialization selects v2 only when `canvas`
is supplied. Legacy v1 files keep the same parsing and serialization contract.

The [shared Canvas text codec](../editor-core/src/documentText.ts) owns metadata
validation, page sources, coordinates and anchors; its
[round-trip tests](../editor-core/src/documentText.test.ts) own fidelity evidence.
