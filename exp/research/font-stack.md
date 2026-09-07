# Font Capability Stack

[返回事实白板](../README.md)

## 当前结构

字体是可替换能力，不是 Cell geometry 权威。`@chardesk/protocol` 决定 grapheme 与 1/2 Cell width；[`@chardesk/fonts`](../../packages/fonts/README.md) 将 grapheme 路由到 `display`、`cjk`、`nerd`、`symbol` 或 `emoji`；Canvas 只消费解析后的 face、scale、baseline 和 weight policy。

Core 默认由系统 monospace 承担 display/CJK，并独立分发 Nerd、symbol 和 monochrome emoji。可选显示包只替换 display/CJK，不复制 Core。现有 Gallery 默认显式选择 Maple。

| 能力 | 当前来源 | 分发事实 | 覆盖事实 |
| --- | --- | --- | --- |
| display + CJK | Maple Mono NF CN 7.900（可选） | Regular 10,724,692 B；Bold 10,905,480 B | 33,092 cmap；Latin `0.6em`，CJK `1.2em` |
| Nerd | Symbols Nerd Font Mono 3.5.1 | 1,344,296 B；27 个互斥 WOFF2；最大 83,252 B | 官方 catalog 10,617/10,617；Canvas `scaleX: 0.6` |
| symbol fallback | JuliaMono 0.63.2 | 1,081,536 B；8 个互斥 WOFF2 | 11,191 cmap；已测目标 glyph 为 `0.6em` advance |
| monochrome emoji | Noto Emoji | 520,316 B | 1,453 cmap |

常用箭头、数学和几何符号按 display → CJK → JuliaMono 解析；Nerd 与 emoji 保持专用 Core face 优先。Maple 文件仍包含上游 NF glyph，但 Profile 不把 Nerd 请求路由给 Maple。

## Gallery 当前试验

Gallery 顺序为 `Maple → Ark → Xiaolai → Maple`，默认 Maple。Ark 是固定本地资源；Xiaolai 3.126 使用在线 CSS，只是可选试验，不是固定分发依赖。

Xiaolai 在 Chromium/WebKit、DPR 1/1.25/2 的已测结果：原生 Cell 7.5×15px / baseline 13px；Gallery Surface 9×20px / baseline 15px；Latin/CJK advance 7.5/15px；`│─┌└→` advance 15px；编辑、命中和矩形复制通过。该结果描述整个 requested stack，不证明每个 glyph 的实际 fallback face 或墨水接缝。

## 权威证据

- 版本、checksum 与资产体积：[Core manifest](../../packages/fonts/manifest.json)、[Maple manifest](../../packages/font-maple/manifest.json)。
- capability 与分发：[Core fonts](../../packages/fonts/README.md)、[Rendering](../../packages/rendering/README.md)。
- 浏览器测量：[font metrics E2E](../../e2e/web-tui-font-metrics.spec.ts)、[font audit E2E](../../e2e/web-tui-font-audit.spec.ts)。
