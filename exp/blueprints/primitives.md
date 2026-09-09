# Cell Primitives 底座

[Widget 状态规范](widgets.md) · [消费接口](../../packages/cell-ui/README.md)

## 所有权

| 模块 | 权威职责 | 禁止依赖 |
| --- | --- | --- |
| Browser adapter | DOM 焦点、坐标换算、遮挡、指针捕获、原生编辑 | 不私有化确认计时与按压编排 |
| `CellInteractionController` | 共享焦点、按压、手势、输入命令、确认调度；Browser 与 TestPilot 共用 | Theme、Canvas、DOM |
| Primitive behavior | Select 命令解释与延迟关闭、Menu 延迟执行与菜单归属；业务值由受控调用方／React adapter 持有 | 外观、Theme、Canvas |
| `ConfirmationSequence` | 纯闪烁阶段；`ActivationFeedbackManager` 适配目标和完成策略 | Widget、命令、Theme、宿主 |
| State projection / appearance | 从状态派生导航高亮与编辑活动，消费主题输出内容及边框最终样式；不持有第二份业务值 | 命令派发、输入副作用 |
| Runtime / Scene | 布局、裁剪、浮层与同次提交的 Buffer／SemanticSnapshot | 不把 Canvas 作为状态来源 |

统一外观覆盖 Button、Checkbox、Select、Toggle、RadioGroup/RadioItem、Slider/RangeSlider、List、Menu、Tree、Tabs、Grid、TextInput/TextArea。能力表区分整控件反色、thumb 字符强调与编辑区域；编辑器在同一外观出口消费实际焦点，规则由 [Widget 规范](widgets.md)拥有，painter 不再覆盖边框颜色。`collection-chrome.ts` 统一选择标记、树展开列和内容缩进。`grid-navigation.ts` 拥有坐标导航与入口选择，FocusManager 保存 Grid 入口 ID。TestPilot 代表活跃宿主，Browser adapter 提供真实宿主焦点，两者独立投影输入来源。底座仍属于同一个包，内部控制器不是新的公开插件 API。

## 生命周期

Dialog 描述归一为 Overlay／Text／Box，补充对话框身份与语义关联，不增加渲染器或业务状态机。FocusManager 拥有入口、模态循环及恢复，外部关闭策略由共享输入路由消费；Semantic DOM 的 focus 只处理节点自身事件，不把后代 focus 重新解释为父容器 focus。

Accordion 复用共享按压与反色；`accordion.ts` 仅拥有标题归属、隐藏判定与焦点恢复候选。Item 的展开值由调用方持有；折叠保留 Tree，Layout/Scene 排除内容子树，交互和语义消费同一隐藏边界。展开命令即时执行，不进入确认序列。

- 业务提交保持原时机；物理按压结束才播放确认，keyup 不重启会话；AT 直接激活立即播放。Select 关闭是行为策略，绘制和闪烁阶段不得选择业务值。
- Menu 例外：`activate` 保留至完整确认结束才派发一次；`0` 即时执行。确认期间锁定同菜单导航及激活；外部点击、外部焦点、Escape、失活、配置／主题变化、目标禁用或卸载取消待执行动作。取消不得补执行，完成时重新验证目标。Menu 不自动关闭祖先 Overlay，调用方在 `onAction` 中决定关闭或导航。
- 确认会话具有唯一 ID，等待释放与播放分离；参照颜色从已解析的 CellBuffer 取得有效前景／背景，不读取 Canvas 像素。内容和标记继续使用最新业务状态。
- 每次 blink 为相对参照颜色的反色／恢复两个完整阶段；每阶段呈现后保持 80ms。默认两次共四阶段，最后一次恢复结束后才交还 hover／focus；`0` 跳过等待、呈现和计时。
- Browser 在 base/overlay Canvas 提交后、TestPilot 在 Buffer 提交后确认对应 session/phase，之后才启动可注入时钟。重复／过期确认与回调无效；延迟呈现不会跳过阶段。
- 取消、配置／主题变更、失活与目标失效清理挂起计时。完成策略仅消费一次，已卸载 scope 不接收关闭命令。
- `confirmation` 快照携带 session、phase、target 与参照颜色；`activationTargetId`／`activationFlashId` 从播放会话派生。它们不表示绝对背景颜色，恢复阶段同样拥有视觉控制权。
- Browser 的输入归属事实仍由呈现节点注册表与 Surface focus 提供；TestPilot 不模拟浏览器遮挡、IME 或真实焦点。

## 验证

[控制器测试](../../packages/cell-ui/src/interaction-controller.test.tsx) · [视觉状态测试](../../packages/cell-ui/src/visual.test.tsx) · [真实浮层 hover](../../e2e/web-tui-hover.spec.ts) · [依赖边界检查](../../scripts/quality/cell-architecture-rules.test.ts)
