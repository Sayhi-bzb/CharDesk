# OpenTUI：能否成为 Web TUI Engine 的 Base？

[返回线索白板](../README.md)

## 研究问题

OpenTUI 是否可以直接作为浏览器 Web TUI Engine 的运行时基础？

## 产品形态

OpenTUI 是 Zig 原生 TUI Core，提供 TypeScript imperative API、React/Solid reconciler 和 terminal renderer。它的成熟形态包括 Renderable Tree、Yoga layout、Cell Buffer、Input/Textarea、Select、ScrollBox、focus、mouse routing、selection、clipping、z-index 和 viewport culling。

## 可利用优势

- Widget/Renderable retained tree 是完整的 TUI Runtime 蓝图。
- Yoga 使用 point scale factor `1`，在 Flexbox 分配后输出整数 terminal cell，并保持相邻元素无 gap/overlap。
- OptimizedBuffer、current/next frame、changed-cell diff 展示了清晰的 Cell rendering pipeline。
- Hit Grid、事件冒泡、capture、clip 和 z-index 已形成一致行为。
- mouse move/over/out 可用，但完整键盘操作不依赖 hover；left down 聚焦最近 focusable Renderable，drag 自动 capture，click 由 down/up 配对形成。
- ScrollBox 已覆盖嵌套内容、scrollbar、sticky scroll、culling 和 `scrollChildIntoView()`。
- Select 使用 `▶` 指示 focused item，并区分 focused surface 与 persistent selected colors；TabSelect 另以整行 underline 表示 selection。
- React JSX 到 Renderable 的映射可作为我们设计 Widget API 和 lifecycle 的参考。

## 不足与风险

- `@opentui/core` 依赖 Zig native library、Bun/Node FFI 和 terminal runtime，没有浏览器支持。
- `@opentui/react` 的 `createRoot()` 直接接受 `CliRenderer`，没有公开 backend-neutral renderer interface。
- OpenTUI Yoga wrapper 同样调用 native FFI，不能独立用于浏览器。
- Input/Textarea 消费 terminal keyboard/paste，不解决 Web composition、IME、移动端软键盘和原生输入语义。
- Terminal 没有与 Widget Tree 对应的 ARIA Semantic Tree。
- Fork 或新增 Browser Backend 需要拆分 Core、React host、Yoga、input 和 buffer，长期同步成本很高。

## 采用结论

状态：`仅作蓝图`

不直接依赖或 fork `@opentui/core` 与 `@opentui/react`。OpenTUI 只作为 Widget Runtime、layout、scroll、interaction 和 buffer behavior 的参考；底层能力必须来自浏览器可消费的独立上游或自有契约。

## 参考边界

- Widget 行为只采用与 terminal 无关的部分，不建立 OpenTUI 兼容目标。
- 自定义 React reconciler 受 README 的条件门约束，不因 OpenTUI 的实现直接引入。
- Cell Buffer、Hit Grid 和 ScrollBox 只贡献行为不变量，不贡献运行时代码。

## 权威来源

- [OpenTUI repository](https://github.com/anomalyco/opentui)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [Layout](https://opentui.com/docs/core-concepts/layout/)
- [Interaction, focus, and selection](https://opentui.com/docs/core-concepts/interaction/)
- [Buffer API](https://opentui.com/docs/reference/buffer-api/)
- [ScrollBox](https://opentui.com/docs/components/scrollbox/)
- [Select](https://opentui.com/docs/components/select/)
- [Tab Select](https://opentui.com/docs/components/tab-select/)
- [Scrollbar](https://opentui.com/docs/components/scrollbar/)
