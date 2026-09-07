# Font Capability Stack

## 结论

字体是可替换能力，不是 Cell geometry 权威。`@chardesk/protocol` 决定 grapheme 与 1/2 Cell width；`@chardesk/fonts` 以 Profile 把 grapheme 分类为 `display`、`cjk`、`nerd`、`symbol` 或 `emoji`；Canvas 只消费解析后的 family、字号比例、横向比例、基线偏移和字重策略。

`@chardesk/fonts` 是 Core 包：独立提供 Nerd、symbol、monochrome emoji，并默认以系统 monospace 承担 display/CJK。`@chardesk/font-maple` 是可选显示包，只提供 Maple display/CJK。现有产品显式选择 Maple，因此视觉未切换；新显示包不再堆叠或复制 Maple。

Maple 兼容包当前仍复用上游 NF CN 文件，所以文件内部仍含 Nerd glyph；Profile 不再把 Nerd 请求路由给它。这一残余重量只属于 Maple 兼容包，不进入 Core，也不约束后续显示包。

## 当前基线

| 能力 | 当前来源 | Regular WOFF2 | Bold WOFF2 | 覆盖事实 |
| --- | --- | ---: | ---: | --- |
| display + CJK | Maple Mono NF CN 7.900（可选包） | 10,724,692 B | 10,905,480 B | 33,092 cmap；CJK 为 `1.2em`，Latin 为 `0.6em` |
| Nerd | Symbols Nerd Font Mono 3.5（Core） | 1,208,788 B（13 个 WOFF2 shard） | — | 固定 catalog 10,385/10,385；Canvas `scaleX: 0.6` |
| symbol fallback | Noto Sans Symbols 2 | 430,316 B | — | 2,948 cmap；不是完整 Unicode fallback |
| monochrome emoji | Noto Emoji | 520,316 B | — | 1,453 cmap |

Maple regular/bold 均覆盖仓库固定的 10,385 个 Nerd 码点，其中 10,382 个图标的 outline 与 advance 完全相同。Nerd 字重可以独立采用单一 regular face，不必随文本字重复制。

## 候选事实

| 候选 | 能力 | 原始单文件/包 | 与当前基线的关系 | 结论 |
| --- | --- | ---: | --- | --- |
| [Symbols Nerd Font Mono 3.5](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/NerdFontsSymbolsOnly) | Nerd | 2,564,060 B TTF | 覆盖全部固定 Nerd catalog，并多 134 cmap；advance 为 `1em` | 可独立采用；在 9×19 / 15px Cell 中需要 `scaleX: 0.6` |
| [Noto Sans Mono CJK SC](https://github.com/notofonts/noto-cjk/blob/main/Sans/Mono/NotoSansMonoCJKsc-Regular.otf) | CJK | 16,393,784 B OTF regular | 当前 Maple CJK 基线缺失数为 0；CJK advance 为 `1em` | 合格候选；保持当前双 Cell 占宽需要 `scaleX: 1.2` |
| [Sarasa Mono SC 1.0.41](https://github.com/be5invis/Sarasa-Gothic/releases/tag/v1.0.41) | display + CJK | 14,037,244 B TTF regular | 当前 Maple CJK 基线缺失数为 0；覆盖 box/block/braille | 合格候选；默认观感尚未决策 |
| [Resource Han Rounded](https://github.com/CyanoHao/Resource-Han-Rounded) | CJK | 上游完整包较大 | Maple 7.9 CN 的 CJK 来源 | 当前观感基线，不作为接口依赖 |
| [GNU Unifont](https://www.unifoundry.com/unifont/index.html) | Unicode fallback | 5,321,400 B OTF | 58,910 cmap；覆盖 BMP、box/block/braille，advance 为半宽/全宽 | 仅作可选最后 fallback；位图观感不进入默认 UI |

原始 TTF/OTF 或归档体积不能代表网页首屏成本。候选进入默认 Profile 前必须生成相同 unicode-range 策略的 WOFF2，并分别记录安装体积、页面实际请求和字形质量。

## 验证

运行字体审计：

```sh
npm run fonts:audit -- \
  --baseline packages/font-maple/assets/maple-mono-nf-cn \
  <font-file-or-directory>
```

审计输出包含总字节数、cmap、关键 Unicode block、Nerd catalog、sample advance、基线差集和 Nerd outline 重复度。字体晋级还需要在 Chromium/WebKit 的 9×19 / 15px Canvas 上验证 raster、baseline、clip 与实际网络请求。
