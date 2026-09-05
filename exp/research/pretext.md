# Pretext：文本布局思想能否帮助 Cell UI？

[返回线索白板](../README.md)

## 研究问题

Pretext 的 DOM-free text measurement 和 layout 架构中，哪些设计适用于确定性的 Cell Text Layout？

## 产品形态

Pretext 是 JavaScript/TypeScript 多行文本测量与断行库。它使用 `Intl.Segmenter` 和 Canvas `measureText()` 准备文本，再以缓存宽度进行低成本重排；调用方可以把行结果渲染到 DOM、Canvas、SVG 或 WebGL。

## 可利用优势

- `prepare → layout → render` 分离，文本分析结果与 viewport width 解耦。
- Cursor/Range API 可以先返回行范围，真正绘制时才 materialize 字符串。
- 缓存 segment geometry，使 resize 和虚拟化 hot path 只做低成本计算。
- 多语言 corpus、跨浏览器 accuracy 和 benchmark dashboard 值得借鉴。
- 普通文本与 rich-inline helper 分层，避免把轻量路径做成完整排版引擎。

## 不足与风险

- Pretext 的权威单位是 font pixel width；我们的权威单位是协议定义的 1/2 Cell width。
- Canvas/font/browser 差异不能进入确定性 Cell Layout。
- 它不提供 Widget Tree、focus、input、scroll、hit testing 或 renderer。
- bidi 元数据和 custom rendering 不是完整 Unicode Bidirectional Algorithm。

## 采用结论

状态：`仅作蓝图`

借鉴两阶段准备、Range API、缓存和验证体系，不使用 Pretext 决定 Cell width。`@chardesk/protocol` 继续作为 Unicode Cell geometry 的唯一权威。

## 未覆盖能力

- 当前尚未确定 Grid Text 是否需要独立 `prepareGridText()` 阶段。
- wrapping、truncation 与 ellipsis 尚无共享的 grapheme range 契约。
- 大列表中的 grapheme 分析缓存尚无本地性能数据。

## 权威来源

- [Pretext repository and API](https://github.com/chenglou/pretext)
- [Research log](https://github.com/chenglou/pretext/blob/main/RESEARCH.md)
- [Accuracy and benchmark dashboard data](https://github.com/chenglou/pretext/blob/main/status/dashboard.json)
