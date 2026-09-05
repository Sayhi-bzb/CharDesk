# Ratzilla：现成 Browser Ratatui 能否成为 Base？

[返回线索白板](../README.md)

## 研究问题

Ratzilla 已把 Ratatui 编译到浏览器并提供多个 Surface，它能否直接承载 React/TypeScript Web TUI？

## 产品形态

Ratzilla 是 Ratatui 官方组织下的 Browser/WASM backend 项目，提供 DOM、Canvas2D 和 WebGL2 backend，并把浏览器键鼠输入转换为 terminal/grid event。

## 可利用优势

- 证明同一 Ratatui Cell Buffer 可以映射到 DOM、Canvas2D 和 WebGL2。
- 已处理 browser resize、animation frame 和 px-to-grid pointer translation。
- 三种 backend 可作为 Canvas2D 性能阈值、WebGL 升级收益和 DOM 成本的现成对照。
- 可用相同 demo 比较我们的 TypeScript Buffer/Surface 契约与 Ratatui 行为。

## 不足与风险

- Widget 和应用仍需用 Rust immediate-mode 编写，不提供 React/TypeScript Host。
- DOM backend 按 Cell 创建 span，落入需要避免的 DOM-per-cell 路径。
- Canvas/WebGL backend 不提供 Widget focus、IME、selection、semantic tree 或事件路由。
- 默认 animation loop 完整 redraw；不符合 React commit/invalidation 驱动的目标。
- JS/WASM 间逐 Widget 或逐 Cell 交互会引入双状态树、ABI 和内存复制成本。

## 采用结论

状态：`仅作蓝图`

不作为 React/TypeScript runtime。它只充当 Browser TUI 实现与性能对照组；WASM paint kernel 仅在独立性能触发条件成立时考虑，且跨边界只传紧凑 display list 或共享 buffer，不传 React Widget Tree。

## 参考基准

- 同尺寸、同字体、同内容下，对照 Ratzilla DOM/Canvas2D/WebGL2 与 CharDesk Canvas 的帧耗时和内存。
- px-to-grid、resize 和 high-DPI 行为只用于提取跨实现不变量。
- Cell Buffer snapshot 只作为行为对照，不引入 Ratzilla 运行时依赖。

## 权威来源

- [Ratzilla repository](https://github.com/ratatui/ratzilla)
- [Backend comparison](https://docs.rs/ratzilla/latest/ratzilla/backend/)
- [DOM backend source](https://github.com/ratatui/ratzilla/blob/main/src/backend/dom.rs)
- [Browser render loop](https://github.com/ratatui/ratzilla/blob/main/src/render.rs)
- [Ratatui organization](https://github.com/ratatui)
