# Flutter Rendering

[返回事实白板](../README.md)

## 当前关系

Flutter Rendering 是多投影 pipeline、relayout boundary、viewport lifecycle 和 semantics 的架构参考；不进入依赖图。

## 已消费的参考

layout/paint/hit/semantic bounds 分离，固定 pipeline phase，parent-size dependency，virtual child cache/keepAlive，以及独立 semantic parent/order/actions。

## 边界

本项目不采用 Dart、Skia、RenderObject/Layer runtime、logical-pixel geometry 或 Flutter golden 作为 Cell 权威。

## 权威来源

[Architecture](https://docs.flutter.dev/resources/architectural-overview) · [PipelineOwner](https://api.flutter.dev/flutter/rendering/PipelineOwner-class.html) · [SemanticsNode](https://api.flutter.dev/flutter/semantics/SemanticsNode-class.html)
