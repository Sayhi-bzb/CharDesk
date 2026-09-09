# Cell Widget 行为规范

[返回事实白板](../README.md) · [UI 哲学](../ui-philosophy.md) · [Semantics](semantics.md)

## 状态与主题

- `focused` 是逻辑焦点，`selected` 是持久选择；二者可共存。
- `pressActive` 是 Host 管理的瞬时按压，不进入业务 command；默认反转控件有效前景/背景。
- focus 与 selected 使用中性背景，focus 增加 bold；hover 更轻且不覆盖 focused/selected/disabled。
- Surface 失去实际焦点时保留逻辑 focusedId，但撤去 focus 背景、bold 与 Canvas Cursor；selection 和编辑状态保留。
- `CellUiTheme` 是 Widget 主题入口；局部 `textStyle` 不重定义状态语言。
- 解析后的状态背景覆盖 Widget 完整布局矩形，包括空白 Cell；透明状态不填充。
- border、disclosure、Tab underline 和 scrollbar 是公共 chrome；全部写入 owner-aware CellBuffer。

## Primitive 快照

| Primitive | Cell 表现 | 输入与语义 |
| --- | --- | --- |
| Root / Box / Text | 结构、背景或文本 | 不产生独立 command；Text 可被 Cell Range 复制 |
| Overlay | root layer、clip、border、背景 | Escape/outside down dismiss；modal `dialog` |
| Button | 单行填充矩形，左右各 1 Cell padding | 全局 focus traversal；完整 tap、Enter、Space 或 AT 激活 |
| Checkbox | renderer-owned `[ ]/[x]/[-]`，label 从第 5 Cell 开始 | checked 与 mixed 进入 Semantic DOM；完整行 tap、Enter、Space 或 AT 激活，disabled 跳过 |
| Slider | renderer-owned `━/─/┃` 单行轨道；可见 label/value 由外部 Cell 组合 | 方向键一步、Page 十步、Home/End 端点；精确 tap/drag 输出 `set-value`，Semantic DOM 投影 numeric range |
| Select | 填充 Trigger＋`▾/▴`，Content 锚定并按 viewport 上下翻转，selected item 使用 `✓` | focus 与 committed selection 分离；Enter/click 提交，Escape/outside dismiss 并恢复 Trigger |
| List / Menu | focused item 整行背景＋bold | Up/Down/Home/End；完整 tap 或 Enter 激活 |
| Tree | level indent、`▾/▸`、label | Left/Right 层级导航；branch expand/collapse，leaf activate |
| Tabs | selected 背景与第二行 `▬` | Left/Right wrap；`tab` 与 `tabpanel` relations |
| Grid | focused/selected Cell | 二维方向键与 row/column semantics |
| TextInput / TextArea | terminal Cell Cursor、selection、composition、编辑背景 | 真实 textarea；textbox value/multiline/readOnly/disabled |
| ScrollArea | overflow 时使用内部 rail 和 corner | wheel、page、track、thumb drag；不建立 DOM scrollbar |

## Pointer 与 Scroll

- pointer down 定位焦点；Button、SelectTrigger 和 Checkbox 移出时撤去按压、移回时恢复，pointer up 仍命中原目标才激活。drag winner、cancel、capture loss 或 blur 永久取消本轮 press。
- ScrollArea 在命中范围内消费 wheel，即使已到边界；区域外页面可滚动，Ctrl+wheel 留给浏览器。
- 横纵 scrollbar 可相互缩小 viewport；可见性在一次 geometry 计算中收敛。thumb 使用半 Cell 精度，drag 以按下时 offset/range/track 为锚。
- scrolling 不改变 selection；Virtual List 只在 focused row 离开 viewport 时把 focus 收敛到可见可用项。

## 编辑视口与 Canvas 边界

- TextArea 可显示双轴 rail；TextInput 隐藏 rail但保留横向 offset。编辑器和 ScrollArea 共用 scroll geometry，不复制 offset state。
- 文本 layout、clip、Cursor、selection、hit 与隐藏 textarea 定位消费同一个 Scene viewport；手动 scroll 不修改 document/history。
- Cell Range 修饰键优先于文本 selection gesture；只读编辑器可滚动，disabled 不新增交互。
- 所有 border、block、thumb 与内容都保留为 `Cell.text` 字符；Canvas 字体路径、Probe 和复制结果一致。

## 证据

[Package contract](../../packages/cell-ui/README.md) · [Widget tests](../../packages/cell-ui/src/complex-widgets.test.tsx) · [Browser tests](../../packages/cell-ui/src/browser.dom.test.tsx) · [Editor scroll E2E](../../e2e/web-tui-editor-scroll.spec.ts)
