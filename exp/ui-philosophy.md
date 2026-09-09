# Cell-native UI 哲学

[返回事实白板](README.md) · [Macintosh 标准](blueprints/macintosh.md) · [Widget 规范](blueprints/widgets.md)

1. **Everything is Cell**：layout、paint、hit、scroll、selection 和 copy 使用整数 Cell；px 只存在于 browser/Canvas 边界。
2. **Every Cell is Unicode**：前景数据是 `Cell.text`，不要求全部通过字体渲染；已登记 Cell graphics 按 Cell 几何确定性绘制，其他 grapheme 走字体。复制、保存与字符快照始终保留原 Unicode；背景、clip、owner 与 hit 是 Cell metadata。登记范围与绘制规则由[共享渲染契约](../packages/rendering/README.md#cell-graphics)拥有。
3. **Every Cell has an Owner**：最终可见 Cell 属于 Widget 或 chrome；renderer 不创建 DOM-per-cell。
4. **Every Input becomes a Command**：keyboard、pointer、wheel、textarea 与 AT action 汇入 Engine command。
5. **State lives in the Grid**：focused、pressActive、activationFlash、manipulating、selected、expanded、disabled 和 editing 在 Cell Scene 中可见。
6. **Keyboard is Complete; Pointer is Direct**：共享 `KeyInput` 保留 phase、逻辑 key、物理 code、location、modifiers、repeat 与 composition；Widget command 不依赖 hover/drag，pointer down 定位，完整 tap 才执行。Host 拥有快捷键 scope、chord 与用户 keymap，Cell UI 只解释 Widget 行为。
7. **Global Rules, Composable Components**：全局 CSS token 拥有颜色，反馈配置拥有确认次数；组件声明反馈区域与能力，统一视觉解析器解释状态，页面只组装内容、行为和布局。
8. **One State, Many Projections**：Canvas、Semantic DOM、clipboard 与 tests 消费同一次 Widget commit。

视觉与交互判断以 [Classic Macintosh → Cell UI](blueprints/macintosh.md) 为标准；OpenTUI 只提供终端构图与工程参考。

## 状态与底座权威

[Widget 规范](blueprints/widgets.md)拥有高亮、选择、按压、确认、编辑与连续操控规则；[Cell Primitives 底座](blueprints/primitives.md)拥有共享控制器、组件行为、反馈与外观的依赖边界。页面只组合内容、行为与 Cell 布局，不重新实现这些机制。

Gallery 实现见 [`exp/web-tui`](web-tui/)。

Gallery props panel 只放有用的配置项，不重复添加 `value`、`pressed` 等运行状态控件；可交互状态直接在 Preview 操作。没有配置项时只展示 Preview，不保留空面板。
