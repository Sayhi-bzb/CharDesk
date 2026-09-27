# OpenTUI

[返回事实白板](../README.md)

## 当前关系

OpenTUI 是 Widget runtime 与终端交互的行为参考；本项目不依赖或 fork 其 Core、React binding、Zig runtime 或 terminal renderer。

## 已消费的参考

Renderable Tree、Yoga Cell layout、Buffer、Hit Grid、focus、selection、ScrollBox 和 widget chrome 影响了本项目的行为契约与 Gallery 视觉语言。

## 边界

OpenTUI 不提供本项目所需的 browser-native IME、Semantic DOM 或 backend-neutral Web runtime。本项目不声明 OpenTUI API 或视觉兼容。

## 权威来源

[OpenTUI repository](https://github.com/anomalyco/opentui) · [Interaction](https://opentui.com/docs/core-concepts/interaction/) · [ScrollBox](https://opentui.com/docs/components/scrollbox/)
