# Ratatui

[返回事实白板](../README.md)

## 当前关系

Ratatui 是整数 Rect、Buffer、frame diff 和 headless backend 的契约参考；不作为 Rust/WASM 依赖。

## 已消费的参考

Widget 向 Buffer 绘制、设备 backend 与 Widget 分离、直接断言 Cell frame，以及 wide-cell 覆盖不留下半格。

## 边界

React 持有 Widget state；CharDesk 持有 Unicode width、focus、events、clip、semantics 和 browser input。本项目不提供 Ratatui API 兼容层。

## 权威来源

[Ratatui architecture](https://github.com/ratatui/ratatui/blob/main/ARCHITECTURE.md) · [Buffer](https://docs.rs/ratatui-core/latest/ratatui_core/buffer/struct.Buffer.html)
