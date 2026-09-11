# CharDesk

[返回事实白板](../README.md)

## 当前关系

CharDesk 是 Cell UI 的内部实现基础，不是外部兼容目标。

## 已消费能力

- [`@chardesk/protocol`](../../packages/protocol/README.md) 拥有 grapheme、Cell width、文本协议和 Cell 数据类型。
- [`@chardesk/rendering`](../../packages/rendering/README.md) 拥有 Canvas presentation、字体解析和网格审计。
- [`@chardesk/fonts`](../../packages/fonts/README.md) 拥有字体 capability 与分发。
- [`@chardesk/cell-ui`](../../packages/cell-ui/README.md) 已拥有 Widget runtime、SceneGeometry、Input Manager、SemanticSnapshot、Range 和测试探针。

## 边界

通用能力提升到所属 package；`exp/` 只消费公共入口，不复制 `src/` 内部实现。
