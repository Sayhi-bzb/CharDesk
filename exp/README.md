# Web TUI 事实白板

本页只登记 Web TUI Engine 当前有效的产品约束、依赖关系和权威入口。交付状态见 [Roadmap](roadmap.md)，交互规则见 [Cell-native UI 哲学](ui-philosophy.md)。被替代的判断只存在于 Git 历史。

## 产品事实

- 产品是可嵌入普通网页的 React/TypeScript TUI，不是 shell 或终端模拟器。
- Everything is Cell：layout、text、scroll、hit、selection 和 copy 使用整数 column/row；px 只存在于浏览器输入与 Canvas 输出边界。
- Cell 尺寸固定；容器余量是 gutter，不反向拉伸 Cell。
- React Widget Tree 是状态入口；Cell Scene、Semantic Tree、clipboard 和测试快照是同一次 commit 的投影。
- Layout 只产生尺寸；SceneGeometry 拥有 scroll、clip、layer、visibility、paint order 和 hit geometry。
- `Cell.text` 是可见前景真值；border、thumb、内容、复制和 Probe 读取相同 Unicode。
- renderer 聚合 row/styled run，不创建 DOM-per-cell；Semantic DOM 按 Widget/Item 创建。
- Canvas 与 Semantic DOM 共用 focus/selection/command 权威。
- 一棵 Widget Tree 只使用一个 Layout Engine；Foreign Surface 默认不进入统一 CellBuffer。
- macOS `⌥⌘`、其他平台 Alt 加 pointer drag 选择最终可见 Cell rectangle，可复制边框、空白和内容。

## 当前上游关系

| 上游 | 当前关系 | 本项目边界 | 事实卡片 |
| --- | --- | --- | --- |
| CharDesk | 直接复用 | Protocol、Canvas rendering、fonts 与 browser host 是内部基础 | [CharDesk](research/chardesk.md) |
| Yoga | 分层采用 | `YogaLayoutEngine` 使用官方 `yoga-layout`，不暴露 Yoga 类型 | [Yoga](research/yoga.md) |
| CodeMirror 6 | 分层采用 | 使用 `@codemirror/state`，不使用 DOM View | [CodeMirror](research/codemirror.md) |
| React Stately | 分层采用 | collection/selection adapter；Semantic DOM 由自有 browser adapter 生成 | [React Aria/Stately](research/react-aria-stately.md) |
| OpenTUI、Ink、Ratatui、Textual | 行为参考 | 不进入运行时依赖图 | [OpenTUI](research/opentui.md)、[Ink](research/ink.md)、[Ratatui](research/ratatui.md)、[Textual](research/textual.md) |
| Pretext、xterm.js、R3F、Flutter、egui | 契约参考 | 不复制其 runtime、scene 或状态权威 | [Pretext](research/pretext.md)、[xterm.js](research/xterm.md)、[R3F](research/react-three-fiber.md)、[Flutter](research/flutter-rendering.md)、[egui](research/egui.md) |
| Zag.js、Taffy、PixiJS、Glide Data Grid | 未采用 | 当前依赖图中不存在；各卡片记录本地边界 | [Zag](research/zag.md)、[Taffy](research/taffy.md)、[PixiJS](research/pixijs.md)、[Glide](research/glide-data-grid.md) |
| Ratzilla | 实现对照 | 不作为 React/TypeScript runtime | [Ratzilla](research/ratzilla.md) |

上游卡片只记录本项目当前关系，不维护外部项目的滚动版本或路线图。字体的实测资产事实单独见 [Font Capability Stack](research/font-stack.md)。

## 架构所有权

| 领域 | 当前权威 | 所有权摘要 |
| --- | --- | --- |
| Domain 与依赖方向 | [Domain reference](../apps/docs/content/docs/development/domains.mdx)、[Ownership](../apps/docs/content/docs/development/architecture/ownership.mdx) | 业务职责与跨包依赖方向 |
| Unicode / Cell width | [`@chardesk/protocol`](../packages/protocol/README.md) | grapheme、1/2 Cell width、continuation 与 offset 映射 |
| Cell Core | [`@chardesk/cell-core`](../packages/cell-core/README.md) | 逻辑 geometry、dense/sparse source、incremental changes、Frame 与字符快照 |
| Widget runtime | [`@chardesk/cell-ui`](../packages/cell-ui/README.md) | React descriptors、layout、scene、events、widgets、semantics 与 testing |
| Geometry / composition | [Compositor 契约](blueprints/compositor.md) | root geometry、clips、scroll、paint/hit order 与 invalidation |
| Widget behavior | [Widget 规范](blueprints/widgets.md) | 状态语言、keyboard/pointer 和 scroll/editor 行为 |
| Semantics | [SemanticSnapshot 契约](blueprints/semantics.md) | 独立 reading tree、actions 与 DOM projection |
| Canvas presentation | [`@chardesk/rendering`](../packages/rendering/README.md) | 标准 CellFrame 到 Canvas px、字体解析与网格审计 |
| Font capability | [`@chardesk/fonts`](../packages/fonts/README.md) | display/CJK/Nerd/symbol/emoji 字体路由；Host 与 Cell UI 的已登记 Unicode graphics 使用[共享专用绘制器](../packages/rendering/README.md#cell-graphics)；[Host 字体偏好](research/font-stack.md#host-字体切换)不改变 Cell width |
| Editor state | `@codemirror/state` adapter | UTF-16 document/history；Cell geometry 由 CharDesk 投影 |
| Browser input | `@chardesk/cell-ui/browser` | textarea、IME、clipboard、pointer、Semantic DOM 与 DPR/resize |
| Delivery status | [Roadmap](roadmap.md) | 已交付、待验证和可实施切片 |

## 当前运行链路

```text
React descriptors
  → Widget Tree
  → Yoga integer LayoutSnapshot
  → SceneSnapshot + SemanticSnapshot
  ├─ owner-aware CellBuffer → Canvas2D
  └─ Semantic DOM

keyboard / pointer / wheel / AT / textarea
  → EngineInput
  → FocusManager + WidgetCommand
  → Stately or CodeMirror state
  → next commit
```

公开组件预览位于 [Cell UI Gallery](web-tui/#/components/text)。编辑、Overlay、复杂 Widget 与虚拟化 fixture 只服务自动化回归。
