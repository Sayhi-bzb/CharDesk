# Taffy：能否替代 Yoga 提供 Cell CSS Grid？

[返回线索白板](../README.md)

## 研究问题

Taffy 的 Block/Flex/Grid、rounding 和 measure 能否通过官方 Browser/TypeScript 边界成为 Cell Layout Engine？

## 产品形态

Taffy 是 Rust layout crate，支持 Block、Flexbox 和 CSS Grid，并被多个 Rust UI/browser engine 使用。Rust API提供 tree、dirty propagation、外部 measure 与累计边界 rounding。

## 可利用优势

- CSS Grid 支持 `fr`、minmax、repeat、显式/隐式轨道、span、auto placement 和 named lines/areas。
- Rounding 先量化累计 absolute edges，再以相邻边界差计算尺寸，适合无缝隙整数 Cell。
- Rust measure callback 能接收 known dimensions、available space、node context 和 style。
- Grid、rounding、measure 和 Yoga comparison corpus 可成为未来布局契约与 golden tests。
- 一套引擎同时支持 Flex/Grid，若未来整体替换 Yoga，不需要 subtree 混用。

## 不足与风险

- 官方仍把 WASM bindings 标为 WIP；现有 wasm-bindgen PR 尚未合并或发布 npm package。
- Draft JS binding 缺少 text measure callback，无法验证真实 CharDesk text layout。
- 当前采用意味着自持 Rust toolchain、wasm bridge、TS types、npm packaging 和生命周期。
- JS object/string style ABI、逐节点结果读取和约 339 KB draft WASM 都需重新设计和测量。
- Taffy 是 0.x；Grid bugfix 可能改变余数分配，必须锁版本和 golden snapshot。

## 采用结论

状态：`观察上游`

Yoga 是唯一默认布局候选。生产环境禁止 Yoga/Taffy 混合 subtree；engine-neutral `LayoutEngine` contract 允许在触发条件全部成立时整体比较或替换。

## 触发条件

- DioxusLabs 发布官方 Browser/Node npm package 与 TypeScript definitions。
- 官方支持 constraint-aware measure callback、增量 tree update 和明确释放契约。
- 产品确认 CSS Grid 是硬需求，而非简单固定 Cell tracks。
- Cell Grid golden、bundle、初始化、ABI 和 1k/5k Widget benchmark 全部通过。

## 权威来源

- [Taffy repository](https://github.com/DioxusLabs/taffy)
- [Grid style source](https://github.com/DioxusLabs/taffy/blob/main/src/style/grid.rs)
- [TaffyTree measure API](https://docs.rs/taffy/latest/taffy/tree/struct.TaffyTree.html)
- [Layout rounding](https://doc.servo.org/taffy/fn.round_layout.html)
- [WASM/JS bindings draft](https://github.com/DioxusLabs/taffy/pull/927)
