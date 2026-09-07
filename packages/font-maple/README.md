# @chardesk/font-maple

Optional compatibility pack built from Maple Mono NF CN. Its Profile routes Maple only to display/CJK; Nerd, general symbol, and emoji capabilities resolve to the independent Core faces.

```ts
import "@chardesk/fonts/fonts.css";
import "@chardesk/font-maple/fonts.css";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
```

Pass `MAPLE_FONT_PROFILE` to the Canvas renderer. The upstream NF files still contain embedded Nerd glyphs, but the Profile does not consume them. A future display pack can avoid that compatibility weight entirely.
