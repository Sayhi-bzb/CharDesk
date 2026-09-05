# PixiJS：何时值得成为 GPU Cell Surface？

[返回线索白板](../README.md)

## 研究问题

PixiJS 能否替代现有 Canvas2D renderer，或在性能超预算后作为 WebGL/WebGPU Cell Surface？

## 产品形态

PixiJS v8 提供 renderer、scene objects、extension/render-pipe、GPU resource 和 WebGL/WebGPU backend。它面向通用 2D scene，不理解 CellBuffer、宽字符、Widget semantics 或 TUI selection。

## 可利用优势

- Renderer abstraction、render pipes、batch pipes 和 backend adaptors 可承载自定义 CellRenderable。
- WebGL context loss/restoration、texture、pipeline 和 resource lifecycle 可减少 GPU 基础设施维护。
- ParticleContainer 可作为平坦 glyph/background quad 的快速性能探针。
- 单一 custom renderable 可从 typed Cell patches 更新 background、glyph、decoration buffer，而不创建 per-Cell object。
- Ratzilla 和 xterm.js 可共同作为 Canvas/WebGL correctness 与性能对照。

## 不足与风险

- Text 频繁变化会重新 rasterize/upload；BitmapText 的 atlas 不适合动态 CJK/emoji；Graphics 不适合每帧 rebuild。
- 高效路径仍需自建 glyph atlas、flat GPU buffers、wide/continuation Cell 和 decoration pipeline。
- `@pixi/react`、Pixi events 和 accessibility 会创建第二套 scene/event/semantic authority。
- Pixi 内部坐标是 px，必须完全隔离在 CellSurface 后。
- WebGPU 与 Canvas backend 仍不适合作为首发要求；DPR、fractional zoom、atlas churn 和 context restore 必须验证。

## 采用结论

状态：`条件后备`

默认继续使用 CharDesk Canvas2D。若实测超出帧预算，Pixi 只作为 `CellSurface` 后的 WebGL infrastructure：stage 中最多一个 CellRenderable，不采用 `@pixi/react`、per-Cell Pixi object、events 或 accessibility。

## 触发条件

- 所有 CJK、emoji、wide Cell、decoration、DPR 和 screenshot correctness tests 通过。
- 240×80 全屏更新 p95 至少比 Canvas2D 快 2× 且低于 8ms。
- 120×40 稀疏更新不比 Canvas2D 慢超过 10%。
- 十分钟 Unicode/style churn 后 atlas 与内存稳定；context restore 不重建 Widget Tree。
- 无 invalidation 时 ticker 停止；若必须使用 per-Cell object 才达标则淘汰。

## 权威来源

- [PixiJS repository](https://github.com/pixijs/pixijs)
- [Renderer](https://pixijs.com/8.x/guides/components/renderers)
- [Architecture](https://pixijs.com/8.x/guides/concepts/architecture)
- [Render loop](https://pixijs.com/8.x/guides/concepts/render-loop)
- [Text](https://pixijs.com/8.x/guides/components/scene-objects/text/canvas)
- [BitmapText](https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap)
- [ParticleContainer](https://pixijs.com/8.x/guides/components/scene-objects/particle-container)
- [Accessibility](https://pixijs.com/8.x/guides/components/accessibility)
