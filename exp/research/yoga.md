# Yoga：能否承担 Browser Cell Layout？

[返回线索白板](../README.md)

## 研究问题

Meta Yoga 的官方浏览器 package 能否直接负责 Web TUI Widget Tree 的整数 Cell Flexbox layout？

## 产品形态

Yoga 是跨平台 Flexbox layout engine。官方 `yoga-layout` package 提供 TypeScript 类型和浏览器 WebAssembly 构建；Node 保存输入 style 与输出 geometry，不接管 rendering、input 或 Widget semantics。

## 可利用优势

- 定义 `1 Yoga point = 1 Cell`，根布局直接使用 viewport columns/rows，不需要在核心层引入 px。
- `pointScaleFactor = 1` 将相邻 box edge 对齐到整数网格，避免分别 round width 造成缝隙或重叠。
- `setMeasureFunc()` 可由 `@chardesk/protocol` 提供文本 intrinsic width/height，使测量与 paint 共用 Cell width 权威。
- dirty propagation、`hasNewLayout()` 和 `markLayoutSeen()` 支持跳过未变化子树。
- Flex direction、grow/shrink、basis、min/max、gap、padding、absolute positioning 足够覆盖菜单和常规 panel 布局。

## 不足与风险

- Yoga 内部仍使用浮点数，需要 golden tests 固定奇数余量、percentage 和嵌套 flex 的 Cell 分配。
- WebAssembly 初始化、显式 Node/Config 释放、SSR/test runner 和 CSP 兼容性必须由 adapter 统一管理。
- Blackboard Reader 已允许 `'wasm-unsafe-eval'`，同时继续禁止普通 JavaScript `eval()`；第三方宿主仍需提供等价的 WASM 权限。
- Measure Node 必须保持叶节点；文本变化需显式 `markDirty()` 并缓存约束测量结果。
- Yoga 只实现 Flexbox；Everything is Cell 是单位约束，不等于支持 CSS Grid tracks、span 或 auto placement。
- Yoga 不负责 text wrapping、scroll、focus、events、buffer、rendering 或 accessibility。

## 采用结论

状态：`分层采用`

`@chardesk/cell-ui` 通过自有 `YogaLayoutEngine` 使用固定版本的 Meta 官方 `yoga-layout`，不使用 OpenTUI wrapper，也不向 Widget API 暴露 Yoga Node、枚举或生命周期。adapter 按 stable WidgetId 复用 Node，并已通过下列采用门槛。

## 采用门槛

- 固定 Yoga 版本、共享 Config、`pointScaleFactor = 1`；adapter 不对 computed edge 或 Rect 二次取整。
- 覆盖 7/8/10/31 列余量、percentage、nested flex、gap/padding/border、min/max、absolute 和 reorder。
- 文本 leaf 仅用 `@chardesk/protocol` 测量 ASCII、中文、combining、ZWJ emoji、tab/newline；最终 geometry 与逐格 paint 一致。
- 每次 mutation 的 incremental layout 必须与 fresh-tree oracle 完全一致；paint-only 更新不得运行 Yoga。
- StrictMode 与 1000 次 create/layout/destroy 后，adapter 的 live Node/Config 计数归零；不能仅用 WASM buffer 容量判断泄漏。
- Vitest、Vite production、目标浏览器与实际 CSP smoke 全部通过；加载失败必须成为显式 engine error。

## 权威来源

实现证据：[layout qualification](../../packages/cell-ui/src/layout.test.tsx)、[performance budget](../../packages/cell-ui/src/performance.test.tsx)、[StrictMode browser lifecycle](../../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit CSP](../../e2e/web-tui-csp.spec.ts)。

- [Yoga](https://www.yogalayout.dev/)
- [Yoga repository](https://github.com/facebook/yoga)
- [External layout systems](https://www.yogalayout.dev/docs/advanced/external-layout-systems)
- [Incremental layout](https://www.yogalayout.dev/docs/advanced/incremental-layout)
- [Point scale factor](https://www.yogalayout.dev/docs/getting-started/configuring-yoga#point-scale-factor)
- [Yoga JavaScript releases](https://github.com/facebook/yoga/releases)
- [Blackboard CSP](../../packages/blackboard/src/server.ts)
- [WebAssembly CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy#wasm-unsafe-eval)
