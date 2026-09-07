# React Aria / Stately

[返回事实白板](../README.md)

## 当前关系

`@chardesk/cell-ui` 分层采用 React Stately collection/list state。依赖版本由 [package manifest](../../packages/cell-ui/package.json) 持有。

## 已消费能力

Stately adapter 提供 keyed collection、focused key、disabled keys 和 selection。Canvas pointer、keyboard 与 Semantic DOM action 进入同一 Engine command path；虚拟集合的语义节点保持有界。

## 边界

不采用 React Aria Components、DOM geometry、Popover placement、Virtualizer 或第二套 focus/selection state。Semantic DOM 由 CharDesk browser adapter 从同一 SemanticSnapshot 生成。

## 权威来源

[Collection adapter](../../packages/cell-ui/src/browser-collections.tsx) · [Semantic tests](../../packages/cell-ui/src/semantics.test.tsx) · [React Spectrum](https://github.com/adobe/react-spectrum)
