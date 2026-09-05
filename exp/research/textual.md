# Textual：哪些 Cell UI 系统契约值得翻译？

[返回线索白板](../README.md)

## 研究问题

Textual 的 Widget DOM、Compositor、scroll、focus、binding 和 headless testing 能否帮助 Browser React Cell Engine？

## 产品形态

Textual 是 Python terminal application framework。App/Screen/Widget retained tree 经 layout 生成 placement，Compositor 再维护 region、virtual region、clip、paint order 和 visible map，最后把 dirty region 渲染为 terminal strips。

## 可利用优势

- Compositor 将 layout geometry、visibility、clip、layer、scroll 和 hit testing 从 renderer 中独立出来。
- Reactive 更新区分 paint、layout 和 recompose，并合并重复 refresh。
- ScrollView 区分 Widget children layout 与大型列表的 virtual line rendering，避免为十万行创建十万个 Widget。
- Screen stack、modal 和 focus restore 提供完整应用层行为样本。
- Binding 同时保存 key、command、label、enabled、visible 和 priority，可被 Footer、Help 和 Command Palette 共用。
- `run_test()` 与 Pilot 使用固定 Cell viewport、Widget selector、逻辑输入和 idle barrier，适合翻译为无浏览器测试驱动。

## 不足与风险

- Textual retained DOM、reactive state 和 per-Widget asyncio message pump 与 React lifecycle 重叠。
- Layout、Compositor、Rich Strip、TCSS 和 Python Widget 交叉较深，没有独立 TypeScript/WASM package。
- Textual Web 在服务器运行 Python subprocess，通过 WebSocket 提供浏览器界面，不是 browser-native engine。
- 它没有独立 Semantic DOM，也不解决 browser IME、mobile input 或 npm/SSR。
- 逐行移植 TCSS、Rich 或 Widget 会形成长期 fork，而不是消费稳定上游。

## 采用结论

状态：`仅作蓝图`

不依赖 Textual runtime。本项目的独立 `SceneGeometry` 层由 [Compositor 契约](../blueprints/compositor.md) 所有；Textual 只提供上游证据与可迁移行为，React 继续拥有唯一 Widget Tree。

## 参考契约

- Compositor visible-map 与 scroll reflow 提供 geometry 行为样本。
- 普通 ScrollView 与 DataTable/Tree line API 提供 child scroll 和 virtual-row 边界样本。
- Pilot 的 selector、Cell offset、resize 和 idle barrier 提供 headless TestSurface 样本。

## 权威来源

- [Textual repository](https://github.com/Textualize/textual)
- [Widgets](https://textual.textualize.io/guide/widgets/)
- [Layout](https://textual.textualize.io/guide/layout/)
- [Events and Messages](https://textual.textualize.io/guide/events/)
- [Reactivity](https://textual.textualize.io/guide/reactivity/)
- [Testing](https://textual.textualize.io/guide/testing/)
- [Compositor source](https://github.com/Textualize/textual/blob/main/src/textual/_compositor.py)
- [Textual Web architecture](https://textual.textualize.io/blog/2024/09/08/towards-textual-web-applications/)
