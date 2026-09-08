# Cell-native UI 哲学

[返回事实白板](README.md) · [Widget 规范](blueprints/widgets.md)

1. **Everything is Cell**：layout、paint、hit、scroll、selection 和 copy 使用整数 Cell；px 只存在于 browser/Canvas 边界。
2. **Every Cell is Unicode**：前景数据是 `Cell.text`，不要求全部通过字体渲染；已登记 Cell graphics 按 Cell 几何确定性绘制，其他 grapheme 走字体。复制、保存与字符快照始终保留原 Unicode；背景、clip、owner 与 hit 是 Cell metadata。登记范围与绘制规则由[共享渲染契约](../packages/rendering/README.md#cell-graphics)拥有。
3. **Every Cell has an Owner**：最终可见 Cell 属于 Widget 或 chrome；renderer 不创建 DOM-per-cell。
4. **Every Input becomes a Command**：keyboard、pointer、wheel、textarea 与 AT action 汇入 Engine command。
5. **State lives in the Grid**：focused、selected、expanded、disabled 和 editing 在 Cell Scene 中可见。
6. **Keyboard is Complete; Pointer is Direct**：共享 `KeyInput` 保留 phase、逻辑 key、物理 code、location、modifiers、repeat 与 composition；Widget command 不依赖 hover/drag，pointer down 定位，完整 tap 才执行。Host 拥有快捷键 scope、chord 与用户 keymap，Cell UI 只解释 Widget 行为。
7. **One State, Many Projections**：Canvas、Semantic DOM、clipboard 与 tests 消费同一次 Widget commit。

## 当前状态语言

- focused 使用完整 item/Cell 背景＋bold；selected 使用持久背景；编辑器使用背景、终端式 Cell Cursor 和 selection，不整段加粗。编辑区域的浏览器 pointer 保持普通箭头，不再表达第二套 I-beam caret。
- hover 只作用于可交互目标，使用更轻背景，不改变任何 Widget state。
- disclosure、Tab underline、scrollbar 和 border 由公共 chrome painter 生成，业务内容不手写。
- content 只在 `contentClip` 内 paint/hit；chrome 不被内容或状态背景覆盖。
- keyboard、pointer 与 AT 共用同一焦点视觉，不按输入方式维护第二套样式。
- Gallery 配色只消费 CSS token → `CellUiTheme`；Canvas painter 不拥有产品颜色。

具体组件行为见 [Widget 规范](blueprints/widgets.md)，Gallery 实现见 [`exp/web-tui`](web-tui/)。
