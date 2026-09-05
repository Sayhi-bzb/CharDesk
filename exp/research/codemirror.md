# CodeMirror 6：哪些编辑能力可以脱离 DOM View？

[返回线索白板](../README.md)

## 研究问题

CodeMirror 6 能否减少 TextInput/TextArea 的 document、transaction、selection 和 IME 维护成本，同时保持 Cell geometry 权威？

## 产品形态

CodeMirror 6 将 immutable `EditorState` 与 imperative DOM `EditorView` 分离。State 保存文档、selection、changes、effects 和扩展；View 使用 contenteditable、DOM observation 和 pixel geometry 处理浏览器编辑。

## 可利用优势

- `@codemirror/state` 不依赖 DOM，提供 immutable Text、EditorSelection、ChangeSet、Transaction、StateField 和 RangeSet。
- Change compose/map/invert 能稳定维护编辑后的 selection、marker 和异步 range。
- StateCommand 证明编辑行为可以只依赖 state 与 dispatch，在 Node 中测试。
- Transaction filter 可表达单行 newline policy，而无需复制编辑模型。
- View 的 IME/browser compatibility 和 viewport tests 可作为自有 InputAdapter 的测试语料。

## 不足与风险

- CodeMirror position 是 UTF-16 offset；其 column 与 CJK/emoji 的 Cell width 不同。
- `@codemirror/view` 依赖可见 contenteditable、MutationObserver、DOM selection、pixel height map 和真实字符测量。
- `@codemirror/commands` 混合 pure state command 与 View-dependent movement/history，整包会把 DOM 依赖带入核心。
- View 的 wrap、vertical movement、selection geometry 和 viewport 不能成为 Cell 布局权威。

## 采用结论

状态：`分层采用`

`@chardesk/cell-ui` 已封装 `@codemirror/state` 的 document、selection 和 ChangeSet；不采用 `@codemirror/view`，也不把 `@codemirror/commands` 整包放入核心。编辑状态使用 UTF-16 offset，CharDesk 单独维护 grapheme/offset 到整数 Cell row/col 的布局索引。

## 采用门槛

- 单行与多行 model 覆盖 composition、paste 和 selection replace；产品当前明确只支持单主 selection。
- 所有 selection 保持在 CharDesk 认可的 grapheme boundary。
- CJK、combining mark、ZWJ/flag emoji 和 tab 在无 soft wrap 的逻辑行中产生一致映射。
- history 与 Cell-aware cursor command 不依赖 `@codemirror/view`，且不引入第二套 geometry 权威。

当前门槛结果：单主 selection 路径已通过 Node、DOM、Chromium 与 WebKit 自动化；真实操作系统 IME 仍属于人工验证项。

## 权威来源

- [CodeMirror System Guide](https://codemirror.net/docs/guide/)
- [CodeMirror Reference](https://codemirror.net/docs/ref/)
- [`@codemirror/state`](https://github.com/codemirror/state)
- [`@codemirror/view`](https://github.com/codemirror/view)
- [`@codemirror/commands`](https://github.com/codemirror/commands)
