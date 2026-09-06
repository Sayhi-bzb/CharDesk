# Cell-native UI 哲学

[返回事实白板](README.md) · [Widget 行为规范](blueprints/widgets.md)

本页只回答 Web TUI 的界面与交互以什么为权威。

## 六条原则

1. **Everything is Cell**：layout、paint、hit、scroll、selection 和 copy 使用整数 Cell；px 只存在于浏览器输入与 Canvas 输出边界。
2. **Every Cell has an Owner**：最终可见 Cell 归 Widget 或其 chrome 所有，但 renderer 不创建 DOM-per-cell。
3. **Every Input becomes a Command**：keyboard、pointer、wheel、textarea 与辅助技术 action 汇入同一种 Engine command；应用只消费 command。
4. **State lives in the Grid**：focused、selected、expanded、disabled、editing 必须在 Cell Scene 中可见；外部状态文字只能补充，不能代替。
5. **Keyboard is Complete; Pointer is Direct**：键盘无需 hover 或 drag 即可完成操作；pointer down 定位焦点，完整 tap 才执行动作。
6. **One State, Many Projections**：Canvas、Semantic DOM、clipboard 与 headless test snapshot 消费同一次 Widget commit，不建立镜像状态机。

## 状态语言

- List/Menu/Tree/Tabs/Grid 的 focused 统一使用整行或整格背景＋bold；List/Menu 无命令光标或专用占位。
- selected 使用底色；focused 与 selected 可以共存。
- 逻辑焦点记住位置，实际焦点所有权控制焦点视觉；失焦不清除选择或编辑状态。Surface 生命周期规则由 [Widget 焦点规范](blueprints/widgets.md#pointer-与-scroll) 所有。
- keyboard、pointer、AT 共用焦点视觉；切换输入方式不改变样式。selected 非 focused 只保留选中背景，二者重合时保留选中背景＋bold。编辑器使用背景、caret 与选区，不把全文加粗。
- Tree disclosure、Tab underline、scrollbar 和 border 是 renderer-owned chrome，业务内容不得手写。
- hover 为可交互集合项提供更轻的中性背景，不加粗、不覆盖 focused/selected，也不改变 focus、selection、expansion 或业务状态；普通文字、空白、disabled 不高亮。鼠标形状由相同的命中结果派生，触摸不产生 hover。
- 内容只在 `contentClip` 内绘制和命中；chrome 最后绘制，内容不能覆盖边框或滚动条。

## Gallery 视觉

实验 Gallery 借鉴 OpenTUI 文档的等宽排版、强调色操作文字和空白分组；采用数据驱动的单页分组导航与连续示例，导航和卡片消费同一 manifest，窄屏目录按组置顶。页面和 Canvas 默认跟随系统明暗；标题右侧图标可手动切换并记住选择。Copy、border 与 theme 使用同一 icon control；tooltip 只用一个短词，theme 与 border 表示点击结果，Copy 固定为 `Copy`。Copy 反馈在图标和可访问名称上原位变化；Demo 不显示操作日志式状态栏或 Cell range 镜像预览。CSS token 是 Gallery 配色唯一来源，经浏览器适配为纯数据 Theme；状态样式解析器决定视觉，Painter 和 Canvas 只负责合成与呈现。面板、高亮、文本选区分别使用独立语义 token；focus/selected 共用中性高亮，以 bold 区分焦点。不修改 CharDesk Host 主题。

## 上游边界

采用 OpenTUI 的 Cell interaction、Hit Grid、Select/TabSelect 和 ScrollBox 行为作为蓝图；不依赖其 Zig/terminal runtime，也不声明运行时兼容。浏览器 IME、Semantic DOM 和 Cell Range 仍由 CharDesk 契约负责。

权威证据：[Interaction](https://opentui.com/docs/core-concepts/interaction/)、[Select](https://opentui.com/docs/components/select/)、[Tab Select](https://opentui.com/docs/components/tab-select/)、[ScrollBox](https://opentui.com/docs/components/scrollbox/)、[Scrollbar](https://opentui.com/docs/components/scrollbar/)。
