# Font Capability Stack

[返回事实白板](../README.md)

## 当前结构

字体是可替换能力，不是 Cell geometry 权威。`@chardesk/protocol` 决定 grapheme 与 1/2 Cell width；[`@chardesk/fonts`](../../packages/fonts/README.md) 将 grapheme 路由到 `display`、`cjk`、`cell-glyph`、`nerd`、`symbol` 或 `emoji`；Canvas 先按[绘制来源](../../packages/rendering/README.md#cell-graphics)分流；只有字体路径消费 face、scale、baseline 和 weight policy。

Core 默认由系统 monospace 承担 display/CJK，并独立分发 Nerd、symbol 和 monochrome emoji。可选显示包只替换 display/CJK，不复制 Core。现有 Gallery 默认显式选择 Maple。

| 能力 | 当前来源 | 分发事实 | 覆盖事实 |
| --- | --- | --- | --- |
| display + CJK | Maple Mono NF CN 7.900（可选） | Regular 10,724,692 B；Bold 10,905,480 B | 33,092 cmap；Latin `0.6em`，CJK `1.2em` |
| Nerd | Symbols Nerd Font Mono 3.5.1 | 1,344,296 B；27 个互斥 WOFF2；最大 83,252 B | 官方 catalog 10,617/10,617；单 Cell；Canvas 等比 `fontSizeScale: 0.8` |
| symbol fallback | JuliaMono 0.63.2 | 1,081,536 B；8 个互斥 WOFF2 | 11,191 cmap；已测目标 glyph 为 `0.6em` advance |
| monochrome emoji | Noto Emoji | 520,316 B | 1,453 cmap |

常用箭头、数学和几何符号按 display → CJK → JuliaMono 解析；Nerd 与 emoji 保持专用 Core face 优先。Maple 文件仍包含上游 NF glyph，但 Profile 不把 Nerd 请求路由给 Maple。

## Gallery 显示字体

Gallery 顺序为 `Maple → Fusion → Xiaolai → Maple`，默认 Maple。Fusion 固定官方 2026.09.01 完整 WOFF2；Xiaolai 固定官方 3.126，并将 22,199,284 B 源 TTF 生成为五个互斥 WOFF2：base 696,040 B、CJK Extension A 2,502,700 B、CJK Unified 5,620,972 B、Hangul 2,802,676 B、supplementary 307,400 B。两者均由独立 workspace 包按需加载，不依赖第三方运行时请求。

Xiaolai 的五片合计保留源字体 44,871 个 cmap 字符；拉丁/CJK advance 为 0.5/1em。Gallery Surface 固定 9×20px / baseline 15px；已登记 Cell graphics 使用共享专用绘制器，未登记箭头仍走显示字体。Chromium/WebKit、DPR 1/1.25/2 的编辑、命中和矩形复制通过；覆盖校验不等价于所有字形墨水都适配 Cell。

## Host 字体切换

Settings → General → Canvas font 提供同一字体目录的三种字体，默认 Maple；Gallery 保持独立选择。Host 本地键 `chardesk-canvas-font-v1` 不进入文档、协作或撤销历史。

Host 持有有效 Profile 与加载状态；成功后同步替换，失败保留原字体并提供就地重试，连续选择仅最新请求生效。正文层、临时绘制层、模板预览、整图与选区 PNG 显式消费 Profile；PNG 捕获导出启动时的有效字体。Host DOM 字体和文本导出 Unicode 不变。

主 Canvas 与 Cell UI 默认使用 9×20 / 15px / baseline 15。精确命中 778 字符 registry 的 grapheme 共用专用绘制器，不等待字体；未登记 symbol fallback 保留。覆盖范围与像素验收矩阵由[共享渲染契约](../../packages/rendering/README.md#cell-graphics)拥有。

Nerd 字形维持一格数据宽度。以 `󰄳` 为事实样本，Symbols Nerd Font Mono
原始 15px 字形约为 15×15px，Canvas 使用 0.8 等比字号得到约 12×12px，
在 9×20px Cell 中居中并允许左右墨水越界；Cell 仍独占布局、命中和复制。

实现：[共享字体目录与加载](../../src/shared/fonts/catalog.ts)、[Host runtime](../../src/shared/fonts/runtime.ts)。验证：[状态测试](../../src/shared/fonts/runtime.test.ts)、[Canvas 缓存重绘](../../src/widgets/canvas-editor/rendering/drawGridLayer.test.ts)、[PNG 路由](../../src/domains/export/raster.dom.test.ts)、[Chromium/WebKit 设置与导出](../../e2e/canvas-font-settings.spec.ts)。

## 权威证据

- 版本、checksum 与资产体积：[Core manifest](../../packages/fonts/manifest.json)、[Maple manifest](../../packages/font-maple/manifest.json)、[Fusion manifest](../../packages/font-fusion/manifest.json)、[Xiaolai manifest](../../packages/font-xiaolai/manifest.json)。
- capability 与分发：[Core fonts](../../packages/fonts/README.md)、[Rendering](../../packages/rendering/README.md)。
- 浏览器测量：[font metrics E2E](../../apps/cell-ui/e2e/font-metrics.spec.ts)、[font audit E2E](../../apps/cell-ui/e2e/font-audit.spec.ts)。
