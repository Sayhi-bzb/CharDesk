# SceneGeometry / Compositor 契约

[返回线索白板](../README.md)

## 所有权

Layout 只产生 Widget 的 parent-relative Cell Rect；SceneGeometry 将它们转换为 root Cell geometry，并统一拥有 scroll、clip、layer、visibility、paint order 与 hit geometry。Canvas Surface 只把 CellBuffer 转为 px。

```text
React commit
  → Widget Tree + invalidation
  → LayoutEngine
  → SceneGeometry
  → CellBuffer paint/diff
  → Browser Surface
```

## 核心类型

```ts
type NodeId = string;
type ClipChainId = string;
type CellPoint = Readonly<{ x: number; y: number }>;
type CellSize = Readonly<{ width: number; height: number }>;
type CellInsets = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;
type CellRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

type SceneEntry = Readonly<{
  id: NodeId;
  sceneParentId: NodeId | null;
  eventParentId: NodeId | null;
  layoutBounds: CellRect;
  decorationBounds: CellRect;
  contentBounds: CellRect;
  virtualRect: CellRect;
  paintBounds: CellRect;
  hitBounds: CellRect;
  outerClip: CellRect;
  contentClip: CellRect;
  clipChainId: ClipChainId;
  paintOrder: number;
  paintVisible: boolean;
  hitTestable: boolean;
  semanticsIncluded: boolean;
  offstageKeptAlive: boolean;
  hitBehavior: "opaque" | "translucent" | "defer-to-child" | "none";
}>;

type SceneSnapshot = Readonly<{
  viewport: CellRect;
  entries: ReadonlyMap<NodeId, SceneEntry>;
  paintList: readonly NodeId[];
  hitIndex: HitIndex;
}>;

type FrameInvalidation = Readonly<{
  phases: readonly ("tree" | "layout" | "geometry" | "paint" | "semantics" | "present")[];
  dirtyRegions: readonly CellRect[];
}>;

interface HitIndex {
  query(point: CellPoint): readonly NodeId[];
}

interface SceneGeometry {
  compose(
    tree: WidgetTree,
    layout: LayoutSnapshot,
    previous?: SceneSnapshot,
  ): SceneSnapshot;
  hitTest(scene: SceneSnapshot, point: CellPoint): readonly NodeId[];
  getEventPath(scene: SceneSnapshot, id: NodeId): readonly NodeId[];
}

interface CellPainter {
  paint(
    id: NodeId,
    target: CellBuffer,
    rect: CellRect,
    paintClip: CellRect,
  ): void;
}

interface Compositor {
  frame(scene: SceneSnapshot, painter: CellPainter): CellBuffer;
}
```

`WidgetTree`、`LayoutSnapshot` 与 `CellBuffer` 由各自层拥有；Compositor 只消费其公开只读契约。所有坐标均为有限整数，Rect 使用半开区间。`layoutBounds` 是应用 ancestor scroll 后的 root layout bounds；`virtualRect` 是最近 scroll container 内容空间中的位置；`paintBounds` 与 `hitBounds` 可以不同于 layout bounds。

`layoutBounds` 是 border box；`decorationBounds` 是扣除 border 后的 padding box；`contentBounds` 再扣除 padding。三者均从 Yoga 的逐边 computed insets 派生。`outerClip` 是节点外框与祖先 `contentClip` 的交集；`contentClip` 再与本节点 `contentBounds` 相交。`clipChainId` 保留 clip topology 与 revision，使局部 clip 变化能精确失效。v1 只支持矩形 Cell bounds；任意形状 hit region 延后。

Portal 的 `sceneParentId` 指向 overlay root，`eventParentId` 保留声明处父级。视觉裁剪和事件传播不得共用同一 parent 字段。

## 行为契约

- `paintList` 是稳定的 back-to-front 全序；hit test 使用其相反顺序，确保最终可见 owner 与 top hit 相同。
- `paintVisible`、`hitTestable`、`semanticsIncluded` 与 `offstageKeptAlive` 分别派生，不能压缩成一个 `visible`。
- Border 和 Padding 是父 Widget 保留空间；普通 content 与 descendants 只能 paint/hit 于 `contentClip`。需要越界的内容必须进入独立 Overlay/Portal layer。
- Painter 对每个 Widget 固定按 `Surface → Chrome → Content → Decoration` 合成：状态/overlay 底色不能擦除 border，内容不能写出 `contentClip`，cursor/disclosure/tab underline 只能写入 `decorationBounds`，不能占用 border Cell。
- Painter 的 Cell 写入使用 `over`：未指定背景时保留目标 Cell 背景，显式背景覆盖；文字、前景、属性和 owner 不继承目标值。每次重绘先清空 Buffer 中的重绘区域，再按 paint order 重建，不继承上一帧背景。
- `Cell.text` 是唯一前景真值；组件 chrome、Canvas、复制、Range、Probe 与 LLM 读取相同 Unicode。Box Drawing 与 Block Elements 使用当前 display font，Canvas 不建立几何前景旁路。
- Cell 数据层的隔离不等于墨水隔离。Gallery 的完整字形试验允许字形越过 Cell 和组件边界；`glyphOverflow="visible"` 使用全 Surface 重绘，默认 `clip` 保留单 Cell 裁剪与增量 raster。契约由 [CellSurface](../../packages/cell-ui/README.md) 所有。
- 浏览器 Surface 的格宽、格高和基线由同步 Cell metrics 决定，`CellSurface` 默认 `9×20 / 15px / baseline 15`，显式 metrics 优先；所有绘制与输入坐标共享结果。字体加载和切换不改变 Cell 占位、viewport 或已挂载布局，只触发重绘与审计；契约由 [CellSurface](../../packages/cell-ui/README.md) 所有，通用 [rendering](../../packages/rendering/README.md#fixed-cell-grids-and-font-measurement) 保持独立兼容默认值。
- 宽字两格分别保存背景；覆盖任一半格清除完整旧字及 owner，但保留各格背景。Canvas 先绘制每个物理 Cell 的背景（包含 continuation），再绘制无背景字形。
- Hit test 使用 `hitBounds ∩ outerClip` 与 `hitBehavior`；descendant 的 `outerClip` 已受祖先 `contentClip` 约束。semantic bounds 与 traversal 由独立 [SemanticSnapshot](semantics.md) 所有。
- Nested scroll 依祖先顺序累计 translation、outerClip 和 contentClip。Scroll 只触发 geometry，不重新运行 LayoutEngine。
- Overlay 默认只受 root viewport outerClip；关闭后的 focus restore 由 FocusManager 负责。
- Pointer capture 属于 EventManager 的 `pointerId → NodeId`，捕获节点卸载、隐藏或 disabled 时释放并发送 cancel。
- CellSurface 只为可识别手势建立交互捕获；pointer-up、pointer-cancel、lost-pointer-capture 统一释放对应 pointerId 的捕获和拖选状态，不依赖手势是否仍存在。正常抬起先完成动作，取消不激活。
- Hit target 确定后，GestureManager 解决 tap、drag 与 ancestor scroll 的竞争，并向失败 recognizer 发送 cancel。
- Modal barrier 阻止下层 pointer、keyboard 与 semantic action，不只影响 paint order。
- 普通 child culling 与 virtual-row mounting 是两种机制：不可见普通 child 保留 SceneEntry；未挂载 virtual row 不生成 SceneEntry。
- Virtual provider 必须拥有 stable key、total/estimated extent、visible/cache range、scroll anchor、reveal、keepAlive 与 dispose 上限。
- LayoutSnapshot 必须记录 child-size dependency/relayout boundary；child size 只在被 parent 消费时向上冒泡 layout dirty。

## 失效级别

| 级别 | 触发 | 工作 |
| --- | --- | --- |
| `TREE` | mount、unmount、reparent、portal target | 重建受影响 scene branch、paint order 与 hit index |
| `LAYOUT` | measure、layout style、viewport size | 运行 LayoutEngine，再重算对应 scene descendants |
| `GEOMETRY` | scroll、clip topology、layer、visibility、overlay anchor | 重算受影响 geometry、paint order 与 hit index |
| `PAINT` | text、color、selection、cursor | 只标记当前 clipped rect 并 repaint |
| `SEMANTICS` | role、label、state、semantic bounds/order、scroll metadata | 重建受影响 SemanticSnapshot branch |

同一 React commit 的失效按 `TREE → LAYOUT → GEOMETRY → PAINT → SEMANTICS` 合并为一帧。Phase 内禁止任意 tree mutation；virtual mount 计划在下一次受控 commit 生效。Geometry 改变必须把旧、新 `paintBounds ∩ outerClip` 都加入 dirty regions；content-only painter 可进一步收窄至 `contentClip`。Dirty regions 只保证覆盖所有变化并限制于 viewport，允许重叠；是否合并属于 rasterizer 策略。

## Headless TestSurface

```ts
interface TestPilot {
  press(...keys: string[]): Promise<void>;
  click(point: CellPoint): Promise<void>;
  pointerDown(point: CellPoint, pointerId?: number): Promise<void>;
  pointerMove(point: CellPoint, pointerId?: number): Promise<void>;
  pointerUp(point: CellPoint, pointerId?: number): Promise<void>;
  scroll(target: NodeId, delta: CellPoint): Promise<void>;
  resize(size: CellSize): Promise<void>;
  pause(): Promise<void>;
  cells(region?: CellRect): CellBuffer;
  text(region?: CellRect): string;
  probe(region?: CellRect): CellProbeSnapshot;
  inspect(point: CellPoint): CellInspection;
  scene(id?: NodeId): SceneSnapshot | SceneEntry;
  hit(point: CellPoint): readonly NodeId[];
  focus(): NodeId | null;
}
```

`pause()` 是唯一 idle barrier；输入方法完成后自动等待一次。Headless tests 不依赖 browser、RAF、font metrics 或 px。

## Cell 检查事实源

`CellProbeSnapshot` 从已提交 `FrameSnapshot` 生成。`text` 服务字符 diff 与 LLM 阅读；versioned JSON 保留 viewport、region、空白 Cell、wide-grapheme continuation、owner、style、focus 和 invalidation。单点 `inspect` 组合 Buffer owner、Scene clip 与 hit stack，不建立第二套状态。

Browser Surface 仅在显式 `probeId` 下暴露同一快照，Playwright负责真实浏览器输入后读取字符结果。字符、边框、裁剪和滚动正确性不得以 screenshot 为主要 oracle；截图只验证字体、颜色、DPR 与像素 presentation。

## 验收不变量

- Nested scroll：累计 offset、outer/content clip intersection、不可见项不 paint/hit、边框不可覆盖、宽字符 follower normalization。
- Overlay portal：不继承 trigger clip；paint/top-hit 一致；事件沿逻辑父级传播；关闭恢复 focus。
- Dirty move/overflow：移动和隐藏清除旧、新 paint bounds；改色不触发 layout 或 scene arrangement。
- Pointer capture：drag 离开 clip仍送达 owner；owner 卸载后 cancel/release。
- Gesture：child tap 与 ancestor scroll竞争；winner 接收完成，loser 接收 cancel；modal barrier阻止下层 action。
- Virtual list：100k rows、10×40 viewport；mounted rows 不超过 visible + 2×overscan；验证 stable key、keepAlive、extent correction、anchor 与 reveal。
- Paint order：重叠节点和 portal 在每个 Cell 上满足最终 Buffer owner 等于 `hit(point)[0]`。
- Paint phases：selected/focused/disabled 组合及 paint-only 重绘后，border glyph 均保持完整；任何 decoration 不覆盖 border。
- Bounds：layout、paint、hit 与 semantic bounds 可不同；semantic traversal 不复用 paint order。
- Cell Range：矩形左右边界对所有行计算 wide-grapheme 定点闭包；规范化后的左边界不是 continuation，右边界不截断 width-2 grapheme。

Steady scroll 1000 次不得调用 LayoutEngine；paint-only 更新的 layout 与 scene arrangement 调用数均为零。10k Widget compose、40×120 full paint 的 8 ms p95 和单行 scroll raster 的 2 ms p95 只作为固定基准机上的优化目标，不是跨机器正确性 gate；必须同时记录相对 full rebuild 的收益。

## CharDesk 边界

`@chardesk/cell-ui` 已实现本页的固定 Cell 主线，包括分级 invalidation、dirty-region Buffer/Canvas present 与 Headless TestPilot。可变 extent virtualization 尚未实现，也不属于当前固定 Cell VirtualGrid 契约。

## 上游依据

- [Textual Compositor](https://github.com/Textualize/textual/blob/main/src/textual/_compositor.py)
- [OpenTUI interaction](https://opentui.com/docs/core-concepts/interaction/)
- [Ratatui Widget](https://docs.rs/ratatui/latest/ratatui/widgets/trait.Widget.html)
- [Ratatui Buffer](https://docs.rs/ratatui/latest/ratatui/buffer/struct.Buffer.html)
- [React Three Fiber events](https://r3f.docs.pmnd.rs/api/events)
- [Flutter rendering pipeline](https://api.flutter.dev/flutter/rendering/PipelineOwner-class.html)
- [Flutter viewport](https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/rendering/viewport.dart)
- [egui Response](https://docs.rs/egui/latest/egui/response/struct.Response.html)
