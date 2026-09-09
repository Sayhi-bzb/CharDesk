# Cell Widget 行为规范

[返回事实白板](../README.md) · [UI 哲学](../ui-philosophy.md) · [Macintosh 标准](macintosh.md) · [Semantics](semantics.md)

## 状态与主题

- `focused` 是逻辑焦点，`selected` 是持久选择；二者可共存。
- `pressActive` 是共享控制器通过 PressManager 管理的离散瞬时按压；`activationFlash` 是 command 已接受后的离散确认；`manipulating` 是 GestureManager 管理的连续 pointer 操控。三者均不进入业务 state。
- Button、Checkbox、Select、Toggle、RadioItem、List、Menu、Tree、Tabs、Grid 共用反色高亮：鼠标与 keyboard/AT 采用最近输入来源，逻辑 focus 独立保留；pointer 移出撤销高亮，键盘恢复同一套高亮。不增加焦点 bold 或 `▶`。Slider/RangeSlider 同样投影输入来源，但仅强调目标 thumb。
- Checkbox checked/mixed、Select selected、Toggle pressed、Radio checked、List/Tree/Grid selected 使用独立字符标记；Tabs 使用当前页下划线。不提供持久选择背景；编辑器保留独立编辑状态配方。
- Surface 失去实际焦点时保留逻辑 focusedId，但撤去 focus 背景、bold 与 Canvas Cursor；selection 和编辑状态保留。
- `CellUiTheme` 是颜色与字符主题入口；`CellFeedbackConfig` 是反馈入口，classic 默认闪烁 2 次，instant 为 0 次。两者共享 hover、focus、press 规则。
- `widget-capabilities.ts` 拥有能力表；状态投影与外观配方分离，painter 只绘制解析结果。局部 `textStyle` 不重定义状态语言；[底座契约](primitives.md)拥有模块边界。
- 统一控件的按压与高亮最多反色一次；确认阶段独占颜色，相对进入时的有效颜色对执行反色／恢复，disabled 拒绝全部临时强调。default Button 保留 primary 基底，outline 保留字符边框，ghost 静止时透明。
- 解析后的状态背景覆盖 Widget 完整布局矩形，包括空白 Cell；透明状态不填充。
- border、disclosure、Tab underline 和 scrollbar 是公共 chrome；全部写入 owner-aware CellBuffer。

## Primitive 快照

| Primitive | Cell 表现 | 输入与语义 |
| --- | --- | --- |
| Root / Box / Text | 结构、背景或文本 | 不产生独立 command；Text 可被 Cell Range 复制 |
| Overlay | root layer、clip、border、背景 | Escape/outside down dismiss；modal `dialog` |
| Button | 单行填充矩形，左右各 1 Cell padding | 全局 focus traversal；完整 tap、Enter、Space 或 AT 激活 |
| Checkbox | renderer-owned `[ ]/[x]/[-]`，label 从第 5 Cell 开始 | checked 与 mixed 进入 Semantic DOM；完整行 tap、Enter、Space 或 AT 激活，disabled 跳过 |
| Toggle | `○ Bold` / `● Bold`；状态灯由全局 `toggleOffIndicator` / `toggleOnIndicator` 提供，label 前保留 2 Cell、右侧 1 Cell padding | button + aria-pressed；整行 tap/Enter/Space 使用统一 press 与确认反馈；状态灯保留在字符快照及复制中 |
| Progress | `█/░`，默认 20×1 Cell | 只读 progressbar；有限正 max 默认 100，value 限制到 0…max，非有限 value 为 0 |
| Separator | 横向 `─` 一行，纵向 `│` 一列 | 无焦点与动作；separator + orientation；消费全局 border 颜色 |
| RadioGroup / RadioItem | `( )/(●)`；Group value 派生直接子项 checked，value 唯一且非空 | radiogroup/radio；组内一个 Tab 入口，方向键循环选择并跳过 disabled；`select-radio` 即时导航，activate 使用统一确认反馈 |
| Slider | renderer-owned `━/─/┃` 单行轨道；pointer hover、keyboard focus 或 manipulating 只将 thumb Cell 切换为 `█`，轨道不反色、不增加 bold；可见 label/value 由外部 Cell 组合 | pointer down 立即进入 manipulating 并保持至 release/cancel；方向键一步、Page 十步、Home/End 端点；精确 tap/drag 输出 `set-value`，无确认闪烁，Semantic DOM 投影 numeric range |
| RangeSlider | `RangeSlider` 拥有共享单行轨道，两个直接 `RangeSliderThumb` 分别拥有 `id/label/value`；外轨 `─`、双 thumb 之间 `━`；thumb 复用 Slider 的统一外观配方 | 两个 thumb 独立 focus 并沿用 `set-value`，无确认闪烁；点击轨道选择最近 thumb，平局优先已 focus thumb再 lower；thumb 不交叉，区间不整体拖动；Semantic DOM 投影 named group 与两个受彼此约束的 numeric slider |
| Select | 填充 Trigger＋`▾/▴`，Content 锚定并按 viewport 上下翻转，selected item 使用 `✓` | focus 与 committed selection 分离；Trigger 只展开，item 的 Enter/click 立即提交并确认闪烁，确认结束后 dismiss；Escape/outside/blur 可提前关闭并保留提交值 |
| List | 固定 2 Cell 选择列，selected 使用全局 `collectionSelectedIndicator`（默认 `✓`）；整行临时反色 | Up/Down/Home/End 仅定位；完整 tap、Enter/Space 即时激活，无确认闪烁 |
| Menu | 整行临时反色，无持久选择标记 | hover 更新临时导航目标；Up/Down/Home/End 导航；完整 tap、Enter/Space 在确认完成后执行，取消丢弃待执行动作 |
| Tree | 每层缩进 2 Cell，独立 `▾/▸` 展开列、`✓` 选择列及 label | Left/Right 层级导航；branch expand/collapse，leaf activate；无确认闪烁；折叠移除焦点后代时收敛到仍可用祖先 |
| Tabs | selected 保留第二行 `▬`，临时反色不改变当前页 | Left/Right wrap、Home/End 即时聚焦并切换可用页面，无确认闪烁；`tab` 与 `tabpanel` relations |
| Grid | GridCell 固定预留 2 Cell 选择列，selected 使用全局 `collectionSelectedIndicator`；外部宽度不变，用户 padding 叠加于标记列内侧；临时强调覆盖整个格子 | 一个 Grid 一个 Tab 入口，优先上次可用焦点、已选可用格子、行列排序首项；方向键沿同一行／列跳过 disabled 与缺格，边界停止；Home/End 定位当前行端点；点击、Enter/Space 即时激活，无确认闪烁；row/column semantics |
| TextInput / TextArea | terminal Cell Cursor、selection、composition、编辑背景 | 真实 textarea；textbox value/multiline/readOnly/disabled |
| ScrollArea | overflow 时使用内部 rail 和 corner | wheel、page、track、thumb drag；不建立 DOM scrollbar |

## Pointer 与 Scroll

- Surface 的基础 Canvas 与 Overlay Canvas 由同一呈现节点注册表拥有；hover、pointer、wheel 共用归属判断。浏览器遮挡检查只允许当前 Surface 的呈现节点，具体 Widget、clip 与 modal scope 由 Scene 判定。所有层使用基础 Canvas 原点和共享 Cell metrics，浮层可以超出基础 viewport。浮层提交、scroll 与 resize 会重新计算静止鼠标的命中。

- pointer down 定位焦点；Button、SelectTrigger、SelectItem、Checkbox、Toggle、RadioItem、ListItem、MenuItem、TreeItem、Tab、GridCell 移出时撤去按压、移回时恢复，pointer up 仍命中原目标才激活。drag winner、cancel、capture loss 或 blur 永久取消本轮 press。
- Button、Checkbox、Toggle、RadioItem 与 SelectItem 接受 activate 后，在物理释放后播放 `activationBlinkCount` 次完整确认；AT 直接激活立即播放，`0` 立即完成。SelectTrigger 展开与 Radio `select-radio` 导航不闪烁。SelectItem 等待释放及播放期间锁定导航、选择和滚动；控制器完成后执行一次 `dismiss`。[反馈会话契约](primitives.md#生命周期)拥有阶段时长和呈现确认。
- SelectItem/MenuItem pointer hover 同步临时导航目标，不提交选择或执行动作；随后 Enter 确认鼠标指向的项。其他组件的 hover 不派发业务命令。
- Tab/Shift+Tab 在当前焦点 scope 内遍历可用控件；RadioGroup 折叠为已选可用项或首个可用项一个入口，到 Surface 边界交还浏览器。
- Grid 导航与入口选择由 `grid-navigation.ts` 拥有，FocusManager 仅保存每个 Grid 的目标 ID，卸载清理。禁用／删除焦点按入口规则收敛，不改写业务选择；全部 disabled 时跳过。Semantic DOM 保留 Surface 管理的程序化焦点，不维护另一套 Tab 顺序。Cell Range 与 Grid selection 独立，范围拖动不激活格子，复制包含可见 `✓` 和边框。
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
