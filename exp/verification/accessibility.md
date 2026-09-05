# Web TUI Accessibility 验收

本页登记 Phase 5 的 Accessibility 验收边界。语义契约由 [SemanticSnapshot](../blueprints/semantics.md) 负责；验收以可重复执行的 snapshot audit、Semantic DOM 和目标浏览器行为测试为权威。

## 门槛

| 门槛 | 状态 | 证据 |
| --- | --- | --- |
| role、name、state、focus、reading order、relations、actions、set position | PASS | [Semantic audit tests](../../packages/cell-ui/src/semantics.test.tsx) |
| Headless role/name 查询与 Semantic DOM 一致 | PASS | [Browser parity tests](../../packages/cell-ui/src/browser.dom.test.tsx) |
| keyboard/AT DOM focus 与逻辑 `focusedId` 同步，包括 modal 重建与 focus restore | PASS | [Chromium/WebKit command palette E2E](../../e2e/web-tui-command-palette.spec.ts)、[complex widgets E2E](../../e2e/web-tui-complex-widgets.spec.ts) |
| Virtual List 保持有界 DOM，并公开逻辑 position/total 与 active item | PASS | [Browser tests](../../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit virtual list E2E](../../e2e/web-tui-virtual-list.spec.ts) |
| Canvas 不重复暴露 Cell；文本编辑使用原生 textarea semantics | PASS | [Browser tests](../../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit editor E2E](../../e2e/web-tui-editor.spec.ts) |

## 边界

真实读屏的语音、措辞和浏览器/OS 组合体验属于产品兼容性 QA，不再作为 Phase 5 的完成门槛。若后续产品化选定受支持的读屏矩阵，应在对应发布策略中建立独立验证卡片，不能回写本阶段事实。
