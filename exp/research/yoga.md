# Yoga

[返回事实白板](../README.md)

## 当前关系

`@chardesk/cell-ui` 通过自有 `YogaLayoutEngine` 分层采用官方 `yoga-layout`。依赖版本由 [package manifest](../../packages/cell-ui/package.json) 持有。

## 已消费能力

- `1 Yoga point = 1 Cell`，共享 Config 使用 `pointScaleFactor = 1`。
- Node 按 stable WidgetId 增量复用；文本 leaf 由 `@chardesk/protocol` 测量。
- 生命周期、整数分配、增量一致性、规模、production build 与浏览器 CSP 均有自动化证据。

## 边界

Widget API 不暴露 Yoga Node、枚举或释放责任。Yoga 只负责 Flex layout，不拥有 scroll、scene、paint、input 或 semantics；同一 Widget Tree 不混用第二个布局引擎。

## 权威来源

[Layout tests](../../packages/cell-ui/src/layout.test.tsx) · [Performance tests](../../packages/cell-ui/src/performance.test.tsx) · [Yoga](https://www.yogalayout.dev/)
