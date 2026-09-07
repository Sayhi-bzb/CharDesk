# Ratzilla

[返回事实白板](../README.md)

## 当前关系

Ratzilla 是 Ratatui 在浏览器中映射到 DOM、Canvas2D 和 WebGL2 的实现对照；不作为 React/TypeScript runtime。

## 已消费的参考

同一 Cell Buffer 跨 backend、browser resize、animation frame 和 px-to-grid 转换可用于 Surface correctness 与性能对照。

## 边界

本项目不采用 Rust immediate Widget、DOM-per-cell backend、默认完整 redraw loop 或 JS/WASM 双状态树。

## 权威来源

[Ratzilla repository](https://github.com/ratatui/ratzilla) · [Backends](https://docs.rs/ratzilla/latest/ratzilla/backend/)
