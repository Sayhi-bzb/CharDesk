# SceneGeometry / Compositor 契约

[返回事实白板](../README.md) · [SemanticSnapshot](semantics.md)

## 所有权

Layout 产生 Widget 的 parent-relative Cell Rect。SceneGeometry 将其投影为 root Cell geometry，并统一拥有 scroll、clip、layer、visibility、paint order 与 hit geometry。Canvas Surface 只把最终 CellBuffer 映射为 px。

逻辑 geometry、source 与 frame 类型由 [`@chardesk/cell-core`](../../packages/cell-core/README.md) 持有；Widget、Layout、Scene 与 Semantic 类型由 [`@chardesk/cell-ui`](../../packages/cell-ui/src/types.ts) 持有。本页不复制类型声明。

```text
Widget Tree → LayoutSnapshot → SceneSnapshot → CellBuffer → Browser Surface
                         └────→ SemanticSnapshot
```

Cell UI 的 bounded CellBuffer 与文档 Canvas 的 sparse reader 分别适配为
`CellFrame`，字符层交给同一个 rendering Presenter；两者不互相依赖，也不
共享 Focus、Gesture 或编辑状态机。

## 行为契约

- 所有 Rect 使用有限整数和半开区间；layout、decoration、content、paint、hit 与 semantic bounds 可以不同。
- `layoutBounds` 是 border box；decoration/content bounds 依 Yoga computed border/padding 派生。
- 普通 content 与 descendants 只能 paint/hit 于祖先 `contentClip`；Overlay 使用独立 scene parent，同时保留逻辑 event parent。
- `paintList` 是稳定 back-to-front 全序；hit test 反向使用同一顺序。
- paint、hit、semantics 和 keepAlive visibility 分别派生，不压缩为单一 `visible`。
- Widget 按 Surface → Chrome → Content → Decoration 合成；content 和状态背景不能覆盖 border。
- `Cell.text` 是唯一前景；Box Drawing、Block Elements、复制、Range 与 Probe 读取相同 Unicode，不存在几何字形旁路。
- wide grapheme 的 lead/continuation 共同失效；覆盖任一半格会清除完整旧字，背景仍按物理 Cell 保存。
- nested scroll 累计 translation 与 clip；scroll 不重新运行 Layout Engine。
- pointer capture 归 EventManager；tap、drag 和 ancestor scroll 由 GestureManager 决胜，失败者收到 cancel。
- modal barrier 同时阻止下层 pointer、keyboard 和 semantic action。
- 普通 culling 不卸载 Widget；固定 VirtualGrid 只为 visible/cache/keepAlive window 建立节点。
- 浏览器 Surface 的格宽、格高和基线由同步 Cell metrics 决定；`CellSurface`、CharDesk Canvas、[rendering](../../packages/rendering/README.md#fixed-cell-grids-and-font-measurement) 与 Viewer 的产品默认值统一为 `9×20 / 15px / baseline 15`，显式 metrics 优先。所有绘制与输入坐标共享结果；字体加载和切换不改变 Cell 占位、viewport 或已挂载布局，只触发重绘与审计。旧 `9×19` 持久化 viewport 只在 schema 升级时按高度比迁移一次。

## 帧与检查

同一 commit 的失效按 `TREE → LAYOUT → GEOMETRY → PAINT → SEMANTICS → PRESENT` 合并。Geometry 改变同时污染旧、新 paint bounds；paint-only 不运行 layout 或 scene arrangement。

[`TestPilot`](../../packages/cell-ui/src/testing.ts) 从提交后的 frame 执行逻辑输入和查询；[`CellProbeSnapshot`](../../packages/cell-ui/src/probe.ts) 是 Headless 与 Browser 共用的字符、owner、style、hit、clip、focus 和 invalidation 快照。截图只负责字体、颜色、DPR 与像素 presentation。

## 证据

[Runtime tests](../../packages/cell-ui/src/runtime.test.tsx) · [Performance tests](../../packages/cell-ui/src/performance.test.tsx) · [Probe tests](../../packages/cell-ui/src/probe.test.tsx)
