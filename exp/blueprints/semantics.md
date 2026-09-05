# SemanticSnapshot 契约

[返回线索白板](../README.md) · [SceneGeometry / Compositor](compositor.md)

## 所有权

SemanticSnapshot 是 Widget Tree 与 Engine state 的独立投影。它不复制 Canvas state，也不复用 scene parent、paint order 或 layout bounds。Browser adapter 将 snapshot 映射为 Semantic DOM；辅助技术 action 回流到同一个 Engine command/state authority。

```text
Widget Tree + Engine State + SceneSnapshot
                  ↓
          SemanticSnapshot
           ├─ DOM projection
           └─ Headless semantic queries

DOM / AT action → EngineInput.semantic → commandForInput → state transition → next snapshot
```

## 核心类型

`NodeId` 与 `CellRect` 使用 Compositor 蓝图中的同一公共 Cell 类型，不建立 semantic-only geometry。

```ts
type SemanticAction =
  | "activate"
  | "focus"
  | "expand"
  | "collapse";

type SemanticNode = Readonly<{
  id: NodeId;
  semanticParentId: NodeId | null;
  traversalOrder: number;
  bounds: CellRect | null;
  role:
    | "dialog"
    | "listbox"
    | "option"
    | "textbox"
    | "menu"
    | "menuitem"
    | "tree"
    | "treeitem"
    | "tablist"
    | "tab"
    | "tabpanel"
    | "grid"
    | "row"
    | "gridcell";
  label: string;
  focused: boolean;
  value?: string;
  disabled: boolean;
  hidden: boolean;
  selected?: boolean;
  expanded?: boolean;
  level?: number;
  rowIndex?: number;
  columnIndex?: number;
  rowCount?: number;
  columnCount?: number;
  positionInSet?: number;
  setSize?: number;
  orientation?: "horizontal" | "vertical";
  controlsId?: NodeId;
  labelledById?: NodeId;
  multiline?: boolean;
  readOnly?: boolean;
  modal?: boolean;
  actions: readonly SemanticAction[];
  activeDescendantId?: NodeId;
}>;

type SemanticSnapshot = Readonly<{
  roots: readonly NodeId[];
  nodes: ReadonlyMap<NodeId, SemanticNode>;
  focusedId: NodeId | null;
  revision: number;
}>;
```

## 行为契约

- Semantic parent/order 由 accessibility reading model 决定，不默认等于 event parent、scene parent 或 paint order。
- `bounds` 使用 Cell 坐标并可与 layout/paint/hit bounds 不同；DOM adapter 才把它转换为 px。
- Canvas 作为 presentation surface，不能与 Semantic DOM 重复朗读内容。
- DOM focus 是物理输入/读屏通道；Engine FocusManager 与 Widget state 是逻辑权威。keyboard/AT 模式下，Browser adapter 将物理焦点同步到 `focusedId` 对应的 semantic node 或 textarea；modal 重建不能丢失这一焦点所有权。
- 每个 AT、keyboard 或 pointer 动作只生成一个 Engine command 和一次 state transition。
- Semantic DOM 只发送 `targetId + SemanticAction`，不得自行构造 WidgetCommand。`commandForInput` 是 keyboard、pointer 与 semantic action 的唯一归一入口；Tree branch 的 primary action 为当前 `expand/collapse`，leaf 才是 `activate`。
- Modal scope 将下层节点标记 hidden/blocked，并拒绝其 actions；不能只通过 z-order 隐藏。
- Semantic DOM 不按 Cell 创建；普通列表按 Widget/Item，虚拟列表按 visible/cache policy 加 focused item 创建。虚拟 item 必须通过 `positionInSet`/`setSize` 保留完整集合中的逻辑位置与总量。
- Tree、Tabs 和 Grid 的 expanded、level、row/column、controls/labelled-by 等关系直接来自同一 Widget commit。
- Snapshot 构建从唯一 focused node 回溯一次 ancestor path，为 composite 派生 active descendant；Browser adapter 每个 snapshot 一次建立 `semanticParentId → children[]`。禁止每个 collection 或 semantic node 重扫完整节点表。

## 失效与提交

Role、label、state、bounds、order、relationship、scroll metadata 或 modal scope 变化时标记 `SEMANTICS`。Semantic flush 发生在 layout、geometry 和 paint snapshot 确定之后；DOM adapter 必须从同一次 commit snapshot 更新，不能读取中途 Host Tree。

## 验收不变量

- Order：portal 的 reading order 独立于 paint order。
- Modal：下层不可读、不可 action；关闭后恢复原逻辑 focus。
- Virtual list：缓存窗口只生成有界语义 item；focus reveal 后 active descendant 存在；每项的逻辑位置和完整集合总量可读。
- Complex widgets：Menu、Tree、Tabs 与 Grid 的 role、relationship、state 和二维索引与 Canvas 同帧一致。
- Single authority：同一 Widget primary action 经 Canvas pointer、Enter/Space 与 AT/DOM action 产生且只产生一次相同 command transition。
- Headless Pilot 与 Browser DOM 查询相同 stable ID、role、name、state 和 focus。
- Scale：增加 composite 或 DOM node 时，focused ancestry 与 children lookup 的完整节点表遍历次数保持常数。

## 上游依据

- [Flutter SemanticsNode](https://api.flutter.dev/flutter/semantics/SemanticsNode-class.html)
- [Flutter SemanticsConfiguration](https://api.flutter.dev/flutter/semantics/SemanticsConfiguration-class.html)
- [React Aria](https://react-spectrum.adobe.com/react-aria/)
- [egui accessibility](https://github.com/emilk/egui/blob/main/docs/accessibility.md)
- [xterm.js Screen Reader Mode](https://github.com/xtermjs/xterm.js/wiki/Design-Document%3A-Screen-Reader-Mode)
