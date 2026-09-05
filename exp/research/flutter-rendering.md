# Flutter Rendering：能否补强 Cell UI Pipeline？

[返回线索白板](../README.md) · [候选检查标准](checklist.md)

## 研究问题

Flutter 的 RenderObject、PipelineOwner、Layer、Sliver 与 Semantics 能否发现当前 Cell Engine 多树 pipeline 的遗漏？

## 肩膀高度

- 架构高度：`A`
- 直接依赖高度：`D`

Flutter 没有可独立消费的 TypeScript/Web 模块；Dart framework、engine、Skia/Web renderer 不进入 Browser React Core。

## 新增价值

- Widget、Element、RenderObject、Layer、Scene 与 Semantics 是不同职责的树；React Fiber 已承担 Widget/Element，不应再复制 Element 层。
- `parentUsesSize` 与 relayout boundary 展示了依赖感知的 layout dirty propagation。
- Pipeline 固定执行 layout、compositing topology、paint、semantics，避免 phase 间任意 mutation。
- Paint bounds、hit bounds 与 semantic bounds 可以不同，不能只使用 layout rect。
- Sliver/Viewport 明确 cache extent、lazy child、keepAlive、garbage、scroll anchor 与 reveal 生命周期。
- Semantics 有独立 parent/order/bounds、merge/exclude/boundary、actions 和 scroll metadata。
- Hit collection 与 gesture resolution 分层；pointer bubbling 不能替代 tap/drag/scroll arbitration。

## 采用结论

状态：`仅作蓝图`

不依赖 Flutter runtime，也不复制其 immediate retained pipeline。只把职责分层、失效边界、虚拟 child 生命周期和 semantics 行为翻译为本项目契约。

明确不采用：

- Flutter runtime、Dart/Skia、logical-pixel transform、RenderObject/Layer 源码移植。
- 多 PipelineOwner、多 Scene、PictureLayer 等非 Cell v1 能力。
- 以 Flutter pixel/golden 行为作为 Cell geometry 权威。

## 采用范围

- Compositor 增加 layout/paint/hit bounds、clip topology、hit behavior 和 virtual child lifecycle。
- 增加独立 SemanticSnapshot 与 `SEMANTICS` phase，不复用 scene parent/order。
- 增加 gesture arbitration、modal barrier、AT reveal/ensure-visible contract。
- 固定毫秒数只作为本地 benchmark target，不作为跨机器正确性 gate。

## 权威来源

- [Flutter architectural overview](https://docs.flutter.dev/resources/architectural-overview)
- [RenderObject](https://api.flutter.dev/flutter/rendering/RenderObject-class.html)
- [PipelineOwner](https://api.flutter.dev/flutter/rendering/PipelineOwner-class.html)
- [RenderObject layout](https://api.flutter.dev/flutter/rendering/RenderObject/layout.html)
- [Viewport source](https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/rendering/viewport.dart)
- [RenderSliverMultiBoxAdaptor](https://api.flutter.dev/flutter/rendering/RenderSliverMultiBoxAdaptor-class.html)
- [SemanticsNode](https://api.flutter.dev/flutter/semantics/SemanticsNode-class.html)
