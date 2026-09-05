# xterm.js：哪些浏览器 Cell 能力值得复用？

[返回线索白板](../README.md)

## 研究问题

xterm.js 的 renderer、IME、selection、viewport 和 accessibility 能否成为通用 Web TUI Engine 的基础？

## 产品形态

xterm.js 是浏览器 terminal emulator。输入先经过 VT/ANSI parser，再写入 terminal-owned buffer；默认 DOM renderer 按可见行和 style run 输出，官方 WebGL addon 使用 typed render model 与 glyph atlas。

## 可利用优势

- Hidden textarea、composition helper 和 Cell cursor 到 px 的定位展示了成熟的 Web IME 边界。
- Selection 覆盖宽字符 continuation、Cell column 与字符串 offset 映射、拖选自动滚动和 wrapped line。
- Screen reader mode 使用独立的可见行级 DOM virtual list，不需要 DOM-per-cell。
- px pointer 坐标在 browser adapter 中立即转换为整数 Cell；viewport 以 logical row 管理滚动。
- Dirty row 合并、typed render model、背景与 glyph 分层可指导 Canvas/WebGL renderer。
- Unicode、CJK、emoji、韩文和 composition tests 是重要兼容性语料。

## 不足与风险

- Buffer 由 VT parser 写入，没有公共 random-access Cell paint API。
- WebGL renderer、IME、selection 和 accessibility manager 都依赖私有 terminal services，不能稳定独立导入。
- Terminal cursor、scrollback、alternate buffer 和 escape bytes 与 Widget focus、事件和 ownership 冲突。
- Unicode addon 绑定 terminal service，不能替代 CharDesk 的 grapheme/Cell width 权威。
- DOM renderer 最坏会退化为每 Cell 一个 style run，不应成为主 renderer。

## 采用结论

状态：`仅作蓝图`

不把 `@xterm/xterm` 作为 Engine Base。借鉴其 Input/IME、selection、accessibility、viewport 和 dirty rendering 设计；只有实现真正的 PTY Terminal Widget 时才直接依赖完整 package。

## 未覆盖能力

- CharDesk Canvas 尚未拥有覆盖中日韩输入法、emoji、dead key 和 paste 的通用 hidden textarea adapter。
- 宽字符拖选与复制尚未形成跳过 continuation Cell 的公共契约。
- Semantic DOM 的可见 Widget/row 节点上界尚未实测。
- DPR、zoom 和 CSS transform 下的 px-to-Cell 映射尚未形成兼容矩阵。

## 权威来源

- [xterm.js repository](https://github.com/xtermjs/xterm.js)
- [Public API](https://xtermjs.org/docs/api/terminal/classes/terminal/)
- [Buffer cell API](https://xtermjs.org/docs/api/terminal/interfaces/ibuffercell/)
- [WebGL addon](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl)
- [Screen Reader Mode design](https://github.com/xtermjs/xterm.js/wiki/Design-Document%3A-Screen-Reader-Mode)
