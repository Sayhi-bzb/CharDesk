# Ratatui：哪些 Cell Buffer 契约值得翻译？

[返回线索白板](../README.md)

## 研究问题

Ratatui 的 Rect、Widget、Buffer、Backend 和 testing 分层能否成为 React/TypeScript Cell Engine 的核心契约？

## 产品形态

Ratatui 是 Rust immediate-mode TUI framework。Widget 将当前状态绘制到 `Buffer`，Terminal 比较前后两帧，再把变化 Cell 交给 Backend；Widget 不直接操作终端。

## 可利用优势

- `Rect` 使用整数 x/y/width/height 和 half-open bounds，适合 Everything is Cell。
- `Widget.render(area, buffer)` 是最小、可测试的 paint 契约。
- Cell Buffer 是 Widget 与设备之间的唯一中间层，支持全帧 paint 后做 Cell diff。
- Painter order、intersection 和 Clear widget 提供 overlay 的最小行为模型。
- Widget unit test 直接断言 Buffer；TestBackend 再覆盖完整 frame、cursor 和 resize。
- 宽 grapheme lead/continuation 与 1↔2 Cell 覆盖测试可作为 Buffer invariant 语料。

## 不足与风险

- Immediate Widget state mutation 不适合 React；selection、scroll 和 open state 应由 React/store 持有。
- Ratatui 不拥有 focus、input、hit registry、capture/bubble 或 browser accessibility。
- 没有完整层级 clip stack；本项目仍需显式 PaintContext clip。
- Rust trait/generic API 无法自然暴露给 TypeScript；逐 Widget 或逐 Cell跨 WASM 会增加 ABI 和内存成本。
- Ratatui 的 Unicode width 不能替代 CharDesk protocol 权威。

## 采用结论

状态：`仅作蓝图`

翻译 `Rect + pure Buffer + full-frame paint + cell diff + TestSurface`，不引入 Ratatui WASM runtime。React 保留 Widget Tree，commit 后 immediate paint 到新 Buffer，再与上一帧比较并 present。

## 可迁移契约

- Wide Cell 的 2→1、1→2 覆盖不留下半格。
- Clip、popup clear、paint order 和 hit region 共用同一整数 Rect。
- 无 DOM Widget snapshot 与 browser Surface integration test 分层运行。
- Full-frame paint 加 Cell diff 必须满足 Compositor 蓝图中的性能目标。

## 权威来源

- [Ratatui repository](https://github.com/ratatui/ratatui)
- [Architecture](https://github.com/ratatui/ratatui/blob/main/ARCHITECTURE.md)
- [Rendering under the hood](https://ratatui.rs/concepts/rendering/under-the-hood/)
- [Buffer](https://docs.rs/ratatui-core/latest/ratatui_core/buffer/struct.Buffer.html)
- [Widgets](https://docs.rs/ratatui/latest/ratatui/widgets/)
- [TestBackend](https://docs.rs/ratatui/latest/ratatui/backend/struct.TestBackend.html)
