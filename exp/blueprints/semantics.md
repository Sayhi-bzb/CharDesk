# SemanticSnapshot 契约

[返回事实白板](../README.md) · [Compositor](compositor.md)

## 所有权

SemanticSnapshot 是 Widget Tree、Engine state 与 SceneSnapshot 的 accessibility 投影。它拥有独立 parent、reading order、bounds、role、state、relations 和 actions；不复制 Canvas state，也不复用 scene parent 或 paint order。

公开类型由 [`@chardesk/cell-ui`](../../packages/cell-ui/src/types.ts) 持有；构建与审计由 [`semantics.ts`](../../packages/cell-ui/src/semantics.ts) 持有。

```text
Widget Tree + Engine State + SceneSnapshot
                  → SemanticSnapshot
                  ├─ Semantic DOM
                  └─ Headless role/name query

DOM / AT action → EngineInput.semantic → WidgetCommand → next snapshot
```

## 稳定不变量

- semantic parent/order 由 reading model 决定；bounds 使用 Cell 坐标，browser adapter 才转换为 px。
- Canvas 是 presentation surface，不向 accessibility tree 重复暴露逐 Cell 内容。
- Engine FocusManager 是逻辑权威；keyboard/AT 模式下 DOM focus 跟随同一个 `focusedId`。
- keyboard、pointer 与 AT action 归一为同一 command；一次动作只产生一次 state transition。
- modal scope 隐藏并拒绝下层 actions；关闭后恢复原逻辑 focus。
- Semantic DOM 按 Widget/Item 创建，不按 Cell 创建。虚拟集合只投影有界窗口和 focused item，并保留逻辑 position/total。
- Tree、Tabs、Grid、List 与 textbox 的 state/relations 来自同一次 Widget commit。
- Snapshot 在 layout/geometry 确定后提交；DOM adapter 不读取中途 Host Tree。

## 证据

[Semantic tests](../../packages/cell-ui/src/semantics.test.tsx) · [Browser parity tests](../../packages/cell-ui/src/browser.dom.test.tsx) · [Accessibility 验收](../verification/accessibility.md)
