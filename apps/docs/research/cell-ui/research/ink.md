# Ink

[返回事实白板](../README.md)

## 当前关系

Ink 是 React Host Tree、Yoga 同步和 commit-to-frame 的参考；不进入运行时依赖图。

## 已消费的参考

Host Node 不等于 Cell、text run 不单独创建 layout node、commit 后统一 layout/paint，以及 `lastFrame()` 风格的 headless 测试边界。

## 边界

本项目不采用 Ink 的 Node streams、TTY/ANSI output、raw input、focus context 或 custom reconciler。React descriptors 与 CellBuffer 仍由 `@chardesk/cell-ui` 拥有。

## 权威来源

[Ink repository](https://github.com/vadimdemedes/ink) · [ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
