# Web TUI 事实白板

这里记录 Web TUI Engine 当前有效的产品约束、上游采用结论、架构权威和可选能力边界。交付切片、验收门槛与状态由 [Web TUI Roadmap](roadmap.md) 统一维护；采用状态的定义与候选检查方法见[候选检查标准](research/checklist.md)。被替代的判断只保留在 Git 历史中。

产品交互以 [Cell-native UI 哲学](ui-philosophy.md) 为权威；Widget 的具体表现以 [Cell Widget 行为规范](blueprints/widgets.md) 为权威。

## 已确定约束

- 产品是可嵌入普通网页的 React/TypeScript TUI，不是 shell 或终端模拟器。
- Everything is Cell：应用、布局、文本、滚动和事件只使用整数 column/row。
- Cell 尺寸固定，不拉伸填满容器；剩余像素成为 gutter。
- px 只存在于浏览器边界，用于绘制 Cell 和把 pointer 坐标转换为 GridPoint。
- 视觉 Cell Scene 与 Web Semantic Tree 分离，但来自同一 Widget Tree。
- 一棵 Widget Tree 只使用一个 Layout Engine；不混用 Yoga/Taffy subtree。
- Canvas 与 Semantic DOM 消费同一份 selection/focus state，不建立双状态或双事件权威。
- Layout 只产生尺寸；SceneGeometry 统一拥有 scroll、clip、layer、visibility、paint order 和 hit geometry。
- Border/Padding 是 Widget chrome；普通 content 与 descendants 只能 paint/hit 于权威 `contentClip`，不能覆盖 chrome Cell。
- Scene、event 与 semantics 是同一 Widget Tree 的三种投影，各自拥有 parent、order 和 bounds。
- Foreign Surface 默认禁止；自带 Canvas、scroll、focus 或 semantic subtree 的 Widget 必须通过产品决策门。
- 逻辑模型可以寻址每个 Cell；renderer 按 row、styled run 或 interactive widget 聚合输出，不创建 DOM-per-cell。
- macOS `⌥⌘` 拖动、其他平台 Alt 拖动创建 viewport Cell Range；`CellSurface` 默认持有状态，选择最终可见 Buffer，可包含边框和空白，不改变 Widget 或编辑器 selection。

## 上游地图

| 线索 | 职责 | 现行结论 | 状态 | 权威卡片 |
| --- | --- | --- | --- | --- |
| CharDesk | 内部基础 | 复用 Unicode/Cell、Canvas rendering、Grid interaction 和 Web input | 可直接复用 | [CharDesk](research/chardesk.md) |
| OpenTUI | 完整 TUI framework | 参考 Widget Runtime、layout、Buffer、Scroll 和事件契约 | 仅作蓝图 | [OpenTUI](research/opentui.md) |
| Pretext | Text layout engine | 参考 `prepare → layout`、range API 和语料验证方法 | 仅作蓝图 | [Pretext](research/pretext.md) |
| Yoga | Layout engine | `YogaLayoutEngine` 以 stable WidgetId 增量复用 Node，整数 Cell、lifecycle、规模、production build 与目标 CSP 门槛已通过 | 分层采用 | [Yoga](research/yoga.md) |
| xterm.js | Browser terminal | 参考 IME、selection、accessibility、dirty row 和 GPU renderer | 仅作蓝图 | [xterm.js](research/xterm.md) |
| Ink | React TUI framework | 参考 React Host Tree、Yoga 同步和 commit-to-frame | 仅作蓝图 | [Ink](research/ink.md) |
| Zag.js | Widget state machines | 完整 Listbox 不采用；collection 仅为 Stately 的条件后备 | 条件后备 | [Zag.js](research/zag.md) |
| CodeMirror 6 | Editor framework | 采用 immutable editor state，不采用 DOM view | 分层采用 | [CodeMirror 6](research/codemirror.md) |
| Ratatui | TUI framework | 参考 Rect、Buffer、cell diff 和 headless backend 契约 | 仅作蓝图 | [Ratatui](research/ratatui.md) |
| Ratzilla | Browser/WASM TUI | 作为 DOM、Canvas2D、WebGL2 浏览器实现与性能对照 | 仅作蓝图 | [Ratzilla](research/ratzilla.md) |
| Textual | TUI application framework | 参考 Compositor、分级失效、virtual line、Screen 和 Pilot | 仅作蓝图 | [Textual](research/textual.md) |
| React Three Fiber | Browser React renderer | 参考 non-DOM Host、events、portal、demand frame 和 test renderer | 仅作蓝图 | [React Three Fiber](research/react-three-fiber.md) |
| React Aria/Stately | Accessible state and behavior | Stately 是 collection/selection 主线；Aria 仅用于 Semantic DOM adapter | 分层采用 | [React Aria/Stately](research/react-aria-stately.md) |
| Taffy | Layout engine | 等待官方 Browser/TypeScript 交付；不与 Yoga 混用 | 观察上游 | [Taffy](research/taffy.md) |
| PixiJS | GPU rendering infrastructure | 仅在 Canvas2D 超出预算后验证单一 CellRenderable | 条件后备 | [PixiJS](research/pixijs.md) |
| Flutter Rendering | Retained UI pipeline | 参考 relayout boundary、pipeline phases、Sliver lifecycle 和 Semantics | 仅作蓝图 | [Flutter Rendering](research/flutter-rendering.md) |
| Glide Data Grid | React Canvas data grid | 参考大型 Grid 行为；完整 DataEditor 受 Foreign Surface 政策阻断 | 条件后备 | [Glide Data Grid](research/glide-data-grid.md) |
| egui/eframe | Web/native immediate GUI | 参考 stable ID、Sense/Response、owner 和 semantic-query tests | 仅作蓝图 | [egui/eframe](research/egui.md) |

## 架构权威

| 层 | 权威 | 现行契约 | 明确不负责 |
| --- | --- | --- | --- |
| React Host | [`@chardesk/cell-ui`](../packages/cell-ui/README.md) | Cell descriptors 生成 stable Widget Tree；`/browser` 的 `CellSurface` 提交 Canvas、真实 textarea 与 Semantic DOM | 应用业务状态、自定义 reconciler |
| Cell Layout | `@chardesk/cell-ui` `YogaLayoutEngine` | viewport 与 style 输入 Yoga，输出整数 border box、逐边 border/padding Insets 和 local content rect | scroll、clip、paint、文本 Cell width |
| Font Capability | [`@chardesk/fonts`](../packages/fonts/README.md) + [字体能力栈](research/font-stack.md) | Profile 将 grapheme 路由到 display/CJK/Nerd/symbol/emoji face，并拥有 font scale、baseline 和 weight policy | grapheme segmentation、Cell width、字体审美选择 |
| Cell Metrics + Font | [CellSurface](../packages/cell-ui/README.md) + [字体测量](../packages/rendering/README.md#fixed-cell-grids-and-font-measurement) | Web TUI 默认 `9×20 / 15px / baseline 15` 同步决定布局；字体加载只重绘与审计，显式 metrics 可覆盖 | Unicode 占位、字形无缝拼接 |
| 完整字形试验 | [CellSurface](../packages/cell-ui/README.md) `glyphOverflow` | Gallery 开启 `visible`，允许墨水越格；全 Surface 重绘避免残影，Probe 标明模式；默认消费者保留 `clip` | 组件像素隔离、增量 raster 性能保证 |
| SceneGeometry / Compositor | `@chardesk/cell-ui` + [完整契约](blueprints/compositor.md) | root geometry、nested scroll、outer/content clips、Overlay 双 parent/layer、paint order 与 hit query 使用同一几何权威 | Widget state、文本测量、px raster |
| Unicode / Text | `@chardesk/protocol` | grapheme、Cell width、continuation Cell 和 offset 映射的唯一权威 | Widget layout、编辑状态、IME |
| Editor State | `@codemirror/state` adapter | UTF-16 document offset 是编辑权威；CharDesk 映射到 grapheme 与 Cell geometry | DOM view、Cell layout、浏览器输入 |
| Widget Behavior | React Stately adapter + [Widget 规范](blueprints/widgets.md) | collection、focused、selection 和 expansion 由 command 驱动；不泄露上游类型 | layout、paint、应用业务状态 |
| Input / IME | `@chardesk/cell-ui/browser` Input Manager | 透明真实 textarea 接收 beforeinput、composition、paste/cut/copy；Canvas pointer 与键盘统一产生 `WidgetCommand` | document state、Cell geometry |
| Focus / Keymap | Engine FocusManager | v0 以 stable WidgetId 处理物理 focus、pointer focus、方向键、disabled skip、activate 与 reveal | DOM layout、paint、selection state |
| Event / Gesture | `@chardesk/cell-ui` `EventManager` / `GestureManager` | pointer input 沿 `eventParentId` capture/bubble；逻辑 pointer capture 与 tap/drag/scroll arena 统一产生完成或 cancel | Widget state、DOM px、应用副作用 |
| Virtualization | `@chardesk/cell-ui` `FixedVirtualGrid` + browser list adapter | 固定 Cell 的二维 visible/cache range、stable-key anchor、reveal、bounded keepAlive 与虚拟 content extent | 业务数据获取、可变行高、Grid Widget 行为 |
| Cell Scene / Buffer | `@chardesk/cell-ui` `CellBuffer` | owner-aware Buffer 支持 full paint 与 dirty-region 增量 raster；wide grapheme 使用 continuation Cell | Widget state、semantics、browser events |
| Cell Range | `@chardesk/cell-ui` + `/browser` adapter | hook 持有矩形坐标与实时文本；Surface 从当前 Buffer 规范化、绘制并复制 `text/plain` | 文档 selection、跨滚动内容、样式序列化 |
| Browser Surface | `@chardesk/cell-ui/browser` + CharDesk Canvas2D | `CellSurface` 拥有 DPR/resize、dirty-region presentation 与 px→Cell hit 边界 | layout、应用状态 |
| Accessibility | [SemanticSnapshot 契约](blueprints/semantics.md) | 同帧投影并自动审计 role/name/state/focus/order/relation/action；DOM 不按 Cell 创建；验收边界与证据见 [Accessibility 验收](verification/accessibility.md) | 视觉树、第二套 focus/selection state |
| Headless Testing | `@chardesk/cell-ui` `TestPilot` | 查询 frame/cells/scene/hit/focus/semantics，执行 keyboard、pointer/gesture、semantic action、scroll、resize 与 idle barrier | browser pixel oracle |
| Cell Inspection | `@chardesk/cell-ui` `CellProbeSnapshot` | Headless 与 opt-in Browser Surface 共用 versioned JSON、字符文本和单 Cell owner/hit/clip/focus 诊断 | font、color、DPR 等 pixel oracle |

## 运行链路

```text
React descriptors
  → stable Widget Tree + mount/update/move/unmount mutations
  → Yoga integer LayoutSnapshot
  → outer/content clip + scroll + paint-order SceneSnapshot
  → FrameSnapshot
      ├─ owner-aware CellBuffer → CharDesk Canvas2D
      └─ SemanticSnapshot → Semantic DOM

Browser keyboard / pointer / wheel / AT action
  → EngineInput → FocusManager → WidgetCommand
  → React Stately collection / focused / selection
  → next descriptor commit

Browser textarea / Canvas pointer
  → text WidgetCommand
  → CodeMirror EditorState adapter (UTF-16 document + history)
  → grapheme / Cell offset projection
  → CellBuffer + caret / selection + semantic textbox

macOS Option+Command / other-platform Alt + pointer drag
  → viewport Cell rectangle
  → latest CellBuffer slice
  → Canvas highlight + plain-text clipboard / LLM input
```

Headless 与 browser 入口分层。[Cell UI 组件文档](web-tui/#/components/text) 为 Text、Box、List 与 ScrollArea 提供独立地址、真实 Canvas 预览、workspace 分发事实、用法和 API。编辑、Overlay、复杂 Widget 与虚拟化切片不进入公开导航，只作为浏览器回归 fixture 保留；所有输入仍共用 command 路径，每次输入最多产生一个 command。

## 交付状态

切片状态、验收门槛、依赖和交付证据统一见 [Web TUI Roadmap](roadmap.md)。本页不维护重复的阶段进度。

## 可选能力边界

这些条件只控制可选方案是否进入依赖图，不阻塞 Cell-native 核心路径：

- Foreign Surface 默认禁止；这只排除完整 Glide DataEditor 集成，不影响自有 Grid Widget。
- Taffy 只有在官方 Browser/Node package、TypeScript definitions 和所需 measure/lifecycle 契约发布，且 CSS Grid 成为硬需求时重新评估；Yoga 主线不等待它。
- PixiJS 只有在 Canvas2D 超出其卡片定义的帧预算后才进入验证；Canvas2D 是可用默认 Surface。
- 自定义 React reconciler 只有在普通 React descriptor 无法满足 Host 契约时才启用；普通 React Host 是默认路径。
- React Stately、CodeMirror State 和 Yoga 的采用门槛用于验证 adapter，不阻止先实现上游无关的公开契约。
