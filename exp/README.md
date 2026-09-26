# Cell UI 上游研究

`exp/` 不再是创作脚手架。当前实现见 [`apps/cell-ui`](../apps/cell-ui/README.md)，架构与采用状态见 [Cell UI 概览](../apps/docs/content/docs/development/cell-ui/overview.mdx)。这里保留外部项目带来的可借鉴机制与不采用边界；版本、实现事实和验证由各自的源码、manifest 与测试持有。

- TUI 与运行时：[OpenTUI](research/opentui.md)、[Ink](research/ink.md)、[Ratatui](research/ratatui.md)、[Textual](research/textual.md)
- 渲染与交互：[Pretext](research/pretext.md)、[React Three Fiber](research/react-three-fiber.md)、[Flutter](research/flutter-rendering.md)、[egui](research/egui.md)

被替代的判断与迁移过程留在 Git 历史。
