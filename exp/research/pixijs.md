# PixiJS

[返回事实白板](../README.md)

## 当前关系

PixiJS 当前未进入依赖图；CharDesk Canvas2D 是默认 Browser Surface。

## 本地边界

GPU backend 必须位于 CellBuffer 后方，不能创建 per-Cell scene object、第二套 React tree、event system 或 accessibility tree。当前没有 Canvas2D 预算失败事实触发 backend 更换。

## 权威来源

[PixiJS repository](https://github.com/pixijs/pixijs) · [Renderer architecture](https://pixijs.com/8.x/guides/concepts/architecture)
