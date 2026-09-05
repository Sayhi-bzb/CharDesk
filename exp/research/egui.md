# egui/eframe：哪些交互与测试契约值得借鉴？

[返回线索白板](../README.md) · [候选检查标准](checklist.md)

## 研究问题

egui 的 immediate-mode interaction、Web input、layer/focus ownership 和 semantic-query tests 能否补充 React Cell Engine？

## 肩膀高度

- 架构高度：`B`
- 直接依赖高度：`D`

## 可利用优势

- Stable `Id`、声明式 `Sense` 与逐帧 `Response` 将交互意图、统一解析和结果快照分开。
- Layer、modal、focus、drag 与 IME owner 为 EventManager 提供通用 GUI 行为样本。
- eframe 长期覆盖 Web Canvas focus、DPR/resize、pointer 出界、touch、pinch、IME、virtual keyboard 和 background tab。
- `request_repaint` handshake 可作为 demand-frame 调度对照。
- `egui_kittest` 按 accessibility role/name 查询同一语义树，并注入 key、hover、drag/drop 与截图测试。
- AccessKit tree 强化 stable semantic ID 与测试查询共用 screen-reader schema 的原则。

## 不足与风险

- egui 是完整 immediate-mode UI/layout/event/paint/state authority，与 React/Compositor/Stately 重复。
- Rust/WASM 会引入 CSP、ABI、序列化、双 runtime 和跨语言调试成本。
- `emath` 使用浮点 geometry，`epaint` 的 tessellation/text 不理解 Cell width 与 continuation Cell。
- AccessKit Web Canvas adapter 仍不可作为现成 Semantic DOM；eframe Web screen reader 使用 SpeechSynthesis，也不等价于浏览器 accessibility tree。
- egui 每帧重跑 UI，不能替代本项目的 TREE/LAYOUT/GEOMETRY/PAINT/SEMANTICS invalidation。

## 采用结论

状态：`仅作蓝图`

不依赖 egui、eframe、emath、epaint 或 AccessKit Web。翻译 stable ID、interaction intent→response、layer/modal/focus/IME ownership fixtures，以及 semantic-query Harness；不复制 immediate-mode runtime。

## 参考契约

- Nested clipped scroll、overlapping modal、drag 离开 clip、focused IME input 使用稳定 ID 输出每步 interaction snapshot。
- Paint/top-hit 同序，modal barrier 阻止下层 action，capture owner 卸载产生 cancel。
- Headless Pilot 能按 role/name 与 WidgetId 查询同一 SemanticSnapshot。
- 任何 production Rust/WASM 依赖、px/float 逻辑权威或第二套 state/layout/focus 都触发淘汰。

## 权威来源

- [egui repository](https://github.com/emilk/egui)
- [Architecture](https://github.com/emilk/egui/blob/main/ARCHITECTURE.md)
- [Id](https://docs.rs/egui/latest/egui/struct.Id.html)
- [Response](https://docs.rs/egui/latest/egui/response/struct.Response.html)
- [Sense](https://docs.rs/egui/latest/egui/struct.Sense.html)
- [eframe changelog](https://github.com/emilk/egui/blob/main/crates/eframe/CHANGELOG.md)
- [Accessibility](https://github.com/emilk/egui/blob/main/docs/accessibility.md)
- [egui_kittest](https://docs.rs/egui_kittest/latest/egui_kittest/)
- [AccessKit](https://github.com/AccessKit/accesskit)
