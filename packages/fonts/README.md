# @chardesk/fonts

Core font capabilities for CharDesk Canvas: Symbols Nerd Font Mono, Noto Sans Symbols 2, monochrome Noto Emoji, capability routing, and the profile factory. Cell width remains owned by `@chardesk/protocol`.

## Install

```sh
npm install @chardesk/fonts
```

```ts
import "@chardesk/fonts/fonts.css";
import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  createCharDeskFontProfile,
} from "@chardesk/fonts";

const profile = createCharDeskFontProfile({
  id: "product/display-v1",
  display: { families: { regular: "'Product Latin', monospace" } },
  cjk: { families: { regular: "'Product CJK', monospace" }, scaleX: 1.2 },
});
```

`CHARDESK_SYSTEM_FONT_PROFILE` uses the platform monospace stack for display/CJK and the packaged core faces for `nerd`, `symbol`, and `emoji`. `createCharDeskFontProfile` appends the selected display/CJK families behind each core face, so characters missing from a subset font retain the active display fallback. A display package contributes only face and source metadata; it does not bundle the core fonts.

The current optional compatibility display is [`@chardesk/font-maple`](../font-maple/README.md). Source versions and checksums are authoritative in `manifest.json`; candidate evaluation lives in the [font capability research card](../../exp/research/font-stack.md).

Font assets retain their upstream licenses beside each family. Package code is MIT licensed.
