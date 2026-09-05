# Cell Widget 行为规范

[返回事实白板](../README.md) · [顶层哲学](../ui-philosophy.md) · [SemanticSnapshot](semantics.md)

本页只回答现有 Cell UI primitive 必须如何布局、显示和响应输入。

## 公共状态与主题

- `focused` / `focusedId` 表示逻辑焦点；`selected` / `selectedId` 表示持久选择。禁止用 `active` 同时表达两者。
- 默认 glyph：expanded `▾`、collapsed `▸`、Tab underline `▬`、scroll thumb `█`；List/Menu 无 cursor 和专用左侧占位，滑块在横纵方向均填满其整数 Cell 范围。
- 默认 focus 与 selected 共用中性高亮，focus 额外 bold；主题值及 CSS 消费接口由 [Cell UI Theme API](../../packages/cell-ui/README.md#theme-consumption) 所有。
- `CellUiTheme` 是唯一 Widget 主题入口；primitive 的 `textStyle` 只覆盖局部内容，不重定义状态语法。
- 样式顺序为 local text → focused surface → selected → focused item accent → disabled；selected 背景不被焦点覆盖。`resolveCellStateStyle` 统一解析，`focusedItemStyle` 为 focused collection item 提供 accent（默认 bold）；编辑器不使用此 accent。
- 解析后的背景属于 Widget 的完整布局矩形，包括空白 Cell；Surface 先填充，Chrome、Content、Decoration 后绘制。透明状态不填充背景。

## Primitive 合约

| Primitive | Cell 表现 | Keyboard / pointer | Semantic state |
| --- | --- | --- | --- |
| Root, Box, Text | 只提供结构或内容 | 不聚焦、不产生 Widget command | 无独立 role；Text 可被全局 Cell Range 复制 |
| Overlay | layer、clip、border 与背景 | Escape/outside down dismiss；modal 限定 focus | `dialog`、modal |
| ListItem | focus 使用整行背景＋bold；selected 使用持久底色 | Up/Down/Home/End；down focus，tap activate | `option`、focused、selected、disabled |
| MenuItem | focus 使用整行背景＋bold；没有 persistent selection | Up/Down/Home/End；down focus，tap/Enter activate | `menuitem`、focused、disabled |
| TreeItem | level indent + `▾/▸` + label；focus 使用整行背景＋bold | Left/Right 层级导航；父行 tap/Enter/AT toggle，叶行 tap/Enter/AT activate | `treeitem`、focused、selected、expanded、level；父行只暴露当前 expand/collapse action |
| Tab | focus 使用背景＋bold；selected 增加底色和第二行 `▬` | Left/Right wrap 并选择；down focus，tap select | `tab`、focused、selected、controls |
| GridCell | focus 使用整格背景＋bold；selected 使用持久底色 | 二维 arrows/Home/End；down focus，tap activate | `gridcell`、focused、selected、row/column |
| TextInput, TextArea | focused surface、caret、selection、composition underline | 真实 textarea 接收输入；Canvas hit 定位 caret/selection | `textbox`、value、multiline、readOnly、disabled |
| ScrollArea | overflow 时占用内部最后一列/行；双轴保留 corner | wheel/content drag；PageUp/PageDown 与 track 按页；thumb 比例 drag | 由 focused descendant reveal；不建立 DOM-per-cell scrollbar |

## Pointer 与 Scroll

- pointer down 只聚焦；up 仍命中同一 item 时才执行。移出、drag winner 或 cancel 均取消 tap。
- CellSurface 不按输入方式切换焦点视觉；逻辑焦点保留时，空白点击或页面失焦不隐藏该样式。headless runtime 保留 `focusVisible` 供宿主显式控制，不改变逻辑 focus、selection 或 semantics。
- ScrollArea 横纵轴分别计算 content extent、viewport、range、track 和 thumb；thumb 至少一个 Cell。
- wheel 的消费与位移独立：最内层可滚动 ScrollArea 在两端仍消费事件，不传给外层；区域外允许页面滚动，Ctrl+wheel 留给浏览器缩放。浏览器使用可取消的原生监听，不锁整个页面。
- 纵向 bar 可能缩小横向 viewport，横向 bar 也可能缩小纵向 viewport；可见性计算必须收敛后再提交 Scene。
- track click 按一个可见 viewport 翻页；thumb drag 将 Cell delta 按可移动轨道比例映射为 content offset。
- Virtual List 的 PageUp/PageDown 将 focus 移到新页对应行；其他滚动仅在 focused row 离开 viewport 时将 focus 收敛到最近可见可用行。滚动不改变 selection。
- scrollbar、border、indicator 与内容都写入 owner-aware CellBuffer；Cell Range 复制最终可见结果。
- Widget 绘制严格分为 Surface、Chrome、Content、Decoration；cursor、disclosure 和 tab underline 使用扣除 border 后的 decoration bounds，状态切换不能覆盖 border。
- Tab 底部内侧一行属于装饰区，布局在业务 padding 之外保留该行；子内容的布局、背景、绘制和命中均不能占据它。下划线完整性与 owner 必须和像素边界分别验证。

## 编辑视口与 Canvas 边界

- TextInput/TextArea 的可用尺寸由 Scene `contentBounds` 决定。Browser 与 TestPilot 通过 `set-viewport` 同步编辑状态；业务不重复填写布局宽高。独立 CellTextEditor 仍支持显式 viewport。
- 尺寸变化不修改文档、selection、composition 或历史；相同尺寸不产生 revision。滚动重新显露 caret，行末保留一个可见 caret Cell。
- CellSurface 启用 renderer 的 `clipToCell`：字形和文字装饰限制在所占一格或两格的像素矩形内，不依赖字体实际字形宽度。
- CellSurface 启用实心块的几何绘制；字符、owner 与复制不变，Canvas 不依赖字体拼接滑块。字符范围和像素对齐由 [renderer 契约](../../packages/rendering/README.md) 拥有；`e2e/web-tui-block-glyphs.spec.ts` 验证真实接缝。
- 验证入口：`e2e/web-tui-boundaries.spec.ts` 检查真实 wheel、完整输入宽度、空白背景、DPR 1/2 的 Tab 像素边界；Cell text 与像素边界分别断言。
