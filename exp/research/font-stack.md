# Font Capability Stack

## 结论

字体是可替换能力，不是 Cell geometry 权威。`@chardesk/protocol` 决定 grapheme 与 1/2 Cell width；`@chardesk/fonts` 以 Profile 把 grapheme 分类为 `display`、`cjk`、`nerd`、`symbol` 或 `emoji`；Canvas 只消费解析后的 family、字号比例、横向比例、基线偏移和字重策略。`symbol` 保留独立分类，但其字体顺序为 display → CJK → JuliaMono，使常用箭头、数学和几何符号优先继承显示字体。

`@chardesk/fonts` 是 Core 包：独立提供 Nerd、symbol、monochrome emoji，并默认以系统 monospace 承担 display/CJK。`@chardesk/font-maple` 是可选显示包，只提供 Maple display/CJK。现有产品显式选择 Maple，因此视觉未切换；新显示包不再堆叠或复制 Maple。

Maple 兼容包当前仍复用上游 NF CN 文件，所以文件内部仍含 Nerd glyph；Profile 不再把 Nerd 请求路由给它。这一残余重量只属于 Maple 兼容包，不进入 Core，也不约束后续显示包。

## 当前基线

| 能力 | 当前来源 | Regular WOFF2 | Bold WOFF2 | 覆盖事实 |
| --- | --- | ---: | ---: | --- |
| display + CJK | Maple Mono NF CN 7.900（可选包） | 10,724,692 B | 10,905,480 B | 33,092 cmap；CJK 为 `1.2em`，Latin 为 `0.6em` |
| Nerd | Symbols Nerd Font Mono 3.5.1（Core） | 1,344,296 B（27 个 WOFF2 shard） | — | 官方 catalog 10,617/10,617；最大 shard 83,252 B；Canvas `scaleX: 0.6` |
| symbol fallback | JuliaMono 0.63.2（Core） | 1,081,536 B（8 个 WOFF2 shard） | — | 11,191 cmap；箭头 24,448 B、标点 44,612 B、数学/技术 86,916 B、图形 130,108 B；目标区段完整且已测 glyph 均为 `0.6em` advance |
| monochrome emoji | Noto Emoji | 520,316 B | — | 1,453 cmap |

Maple regular/bold 覆盖官方 catalog 中 10,386/10,617 个 Nerd 码点，其中 10,383 个图标的 outline 与 advance 完全相同。Nerd 字重可以独立采用单一 regular face，不必随文本字重复制。

## 候选事实

| 候选 | 能力 | 原始单文件/包 | 与当前基线的关系 | 结论 |
| --- | --- | ---: | --- | --- |
| [Symbols Nerd Font Mono 3.5.1](https://github.com/ryanoasis/nerd-fonts/tree/v3.5.1/patched-fonts/NerdFontsSymbolsOnly) | Nerd | 2,610,012 B TTF | 覆盖官方 10,617 码点 catalog；advance 为 `1em` | 已独立采用；按语义组及 96 KiB 上限切片，在 9×20 / 15px Cell 中使用 `scaleX: 0.6` |
| [Noto Sans Mono CJK SC](https://github.com/notofonts/noto-cjk/blob/main/Sans/Mono/NotoSansMonoCJKsc-Regular.otf) | CJK | 16,393,784 B OTF regular | 当前 Maple CJK 基线缺失数为 0；CJK advance 为 `1em` | 合格候选；保持当前双 Cell 占宽需要 `scaleX: 1.2` |
| [Sarasa Mono SC 1.0.41](https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.41) | display + CJK | 14,037,244 B TTF regular | 当前 Maple CJK 基线缺失数为 0；覆盖 box/block/braille | 合格候选；默认观感尚未决策 |
| [Resource Han Rounded](https://github.com/CyanoHao/Resource-Han-Rounded) | CJK | 上游完整包较大 | Maple 7.9 CN 的 CJK 来源 | 当前观感基线，不作为接口依赖 |
| [GNU Unifont](https://www.unifoundry.com/unifont/index.html) | Unicode fallback | 5,321,400 B OTF | 58,910 cmap；覆盖 BMP、box/block/braille，advance 为半宽/全宽 | 仅作可选最后 fallback；位图观感不进入默认 UI |

原始 TTF/OTF 或归档体积不能代表网页首屏成本。候选进入默认 Profile 前必须生成相同 unicode-range 策略的 WOFF2，并分别记录安装体积、页面实际请求和字形质量。

## Xiaolai Mono 页面试用

Gallery 提供 `Maple → Ark → Xiaolai → Maple`，默认 Maple；Xiaolai 使用
[在线 CSS](https://fontsapi.zeoseven.com/282/main/result.css)，标注版本 3.126、
Regular 400。它不是固定本地资源，来源可能变化；不代表正式兼容或默认字体选择。
Profile 和加载参数由 [Gallery 配置](../web-tui/font-options.ts) 持有，沿用
15px、regular-only、Maple fallback 和现有按需加载/失败重试流程。

Chromium/WebKit、DPR 1/1.25/2 的实际 Profile 测量：

| 项目 | 结果 |
| --- | --- |
| 字体原生 Cell / baseline | 7.5×15px / 13px |
| Gallery Surface Cell / baseline | 9×20px / 15px |
| `AiMW` / `世界` advance | 7.5px / 15px |
| `│─┌└→` advance | 15px；在 9px Surface Cell 中越格 6px |
| `█▀▄` advance | 7.5px |
| 编辑、命中、矩形复制 | 六组真实字体测试通过 |

这是整个 requested stack 的测量，Canvas 不能确认单个 glyph 的实际 fallback
face；不据此宣称 Xiaolai 覆盖全部符号。墨水接缝也不由 advance 通过来证明。

[字体交互测试](../../e2e/web-tui-font-metrics.spec.ts) 的 Xiaolai 分支通过
`WEB_TUI_LIVE_FONTS=1` 显式启用，输出文字 Snapshot 和完整字体审计附件。
默认回归不依赖在线字体；[受控加载测试](../../e2e/web-tui-xiaolai.spec.ts)
验证延迟与失败恢复，[CSP 测试](../../e2e/web-tui-csp.spec.ts) 验证远程来源
被阻止后保留 Ark。浏览器测试入口见 [package.json](../../package.json)。

## 验证

运行字体审计：

```sh
npm run fonts:audit -- \
  --baseline packages/font-maple/assets/maple-mono-nf-cn \
  <font-file-or-directory>
```

审计输出包含总字节数、cmap、关键 Unicode block、Nerd catalog、sample advance、基线差集和 Nerd outline 重复度。字体晋级还需要在 Chromium/WebKit 的 9×20 / 15px Canvas 上验证 raster、baseline、clip 与实际网络请求。
