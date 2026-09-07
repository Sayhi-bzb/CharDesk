# Web TUI Roadmap

本页是 Web TUI 交付状态的唯一权威。产品约束、架构契约和上游采用结论见[事实白板](README.md)。

看板只记录可验收的产品切片。状态变化直接更新卡片；不记录轮次、日期、百分比或过程叙述。

## 状态定义

| 状态 | 判定 |
| --- | --- |
| `DONE` | 实现存在，并有可定位的自动化测试或权威文档证据 |
| `VERIFY` | 实现存在，但生产环境、真实设备或专项门槛尚未验证 |
| `READY` | 依赖已满足，可以直接实施 |
| `BACKLOG` | 目标已定义，但前置切片尚未完成 |
| `BLOCKED` | 存在无法由仓库内工作解除的明确外部阻塞 |

## DONE

| ID | Phase / 切片 | 已交付事实 | 验收证据 |
| --- | --- | --- | --- |
| P5.17 | Phase 5 / Cell graphics 扩展 | 主 Canvas、Cell UI 与 PNG 以精确 registry 共用 778 个确定性 Unicode 图形：Box 128、Block 32、Braille 256、Powerline 38、Progress 12、Git Branch 62、Legacy 250；支持完整定义类型、CHAR/CELL scale、clip 与负片背景，字体切换不改变图形，复制/Range/Probe 保留原 Unicode | [绘制契约](../packages/rendering/README.md#cell-graphics)、[定义同步](../scripts/rendering/sync-xterm-cell-graphics.mjs)、[覆盖测试](../packages/rendering/src/cell-graphics.test.ts)、[双浏览器像素矩阵](../e2e/web-tui-cell-graphics.spec.ts) |
| P5.18 | Phase 5 / Terminal Cell Cursor | CellSurface 默认使用可闪烁 Block Cursor，并支持 block/bar/underline 主题形态；Block 按 grapheme allocation 覆盖 1/2 Cell 并反色重绘 glyph；blink 缓存/恢复局部像素，不产生 Runtime commit，失焦隐藏、后台暂停、reduced-motion 常亮；编辑区域 browser pointer 统一为 default | [Cursor 契约](../packages/cell-ui/README.md#theme-consumption)、[Browser tests](../packages/cell-ui/src/browser.dom.test.tsx)、[双浏览器像素与 token](../e2e/web-tui-theme-tokens.spec.ts)、[Pointer 验证](../e2e/web-tui-hover.spec.ts) |
| P5.15 | Phase 5 / Box/Block 绘制基础 | 当前 778 字符 registry 中的 U+2500–U+259F 160 字符保持字体独立与原 Unicode；Box 默认 1.5× 线宽，笔画中心对齐设备像素，圆角使用等半径相切圆弧、双线保持分离 | [绘制契约](../packages/rendering/README.md#cell-graphics)、[覆盖测试](../packages/rendering/src/cell-graphics.test.ts)、[清晰度与连接](../e2e/web-tui-box-clarity.spec.ts) |
| P5.16 | Phase 5 / Host 字体消费 | Settings → General 切换本地 Maple/Ark/Xiaolai；偏好独立持久化；主 Canvas、模板预览、整图与选区 PNG 消费有效 Profile；失败重试与最新请求提交，不改 Cell 几何或文档 | [Host 字体契约](research/font-stack.md#host-字体切换)、[状态测试](../src/shared/fonts/runtime.test.ts)、[PNG 测试](../src/domains/export/raster.dom.test.ts)、[Chromium/WebKit 设置验证](../e2e/canvas-font-settings.spec.ts) |
| P6.2 | Phase 6 / Cell Core | 独立公共包 `@chardesk/cell-core` 持有逻辑 geometry、通用 Rect 运算、dense/sparse source、incremental changes、Frame 与字符快照；不依赖 React、DOM、Canvas、字体或产品状态，并进入统一版本、打包与 npm 发布链路 | [包契约](../packages/cell-core/README.md)、[contract tests](../packages/cell-core/src/index.test.ts)、[架构守卫](../scripts/quality/cell-architecture-rules.test.ts)、[发布契约](../release-please-config.json) |
| P6.3 | Phase 6 / 统一 Presenter | rendering 根入口持有 `CharDeskCellMetrics`、`CharDeskCellFrameCell` 与字符检查；Canvas 子入口只持有 context、raster 与 Presenter 专属契约；glyph span、物理背景 span、dirty filtering 和 query overscan 有明确契约 | [渲染契约](../packages/rendering/README.md#fixed-cell-grids-and-font-measurement)、[Presenter tests](../packages/rendering/src/canvas.test.ts)、[架构守卫](../scripts/quality/check-cell-architecture.mjs) |
| P6.4 | Phase 6 / 双生产者接入 | Cell UI 的 bounded CellBuffer 与主 Canvas 的 sparse reader 均输出 `CellFrame<CharDeskCellFrameCell>` 并使用同一 Presenter；adapter 不互相依赖，各自保留 Scene、Semantics、编辑工具与 overlay 状态机 | [Cell UI adapter](../packages/cell-ui/src/frame.test.ts)、[Canvas adapter](../src/widgets/canvas-editor/rendering/canvasCellFrame.test.ts)、[双 adapter parity](../scripts/quality/cell-frame-adapter-parity.test.ts)、[Canvas presenter parity](../src/widgets/canvas-editor/rendering/drawGridLayer.test.ts) |
| P6.5 | Phase 6 / Frame 检查 | rendering 根入口可从 storage-neutral Frame 输出保留负坐标、空白和 wide grapheme 的字符快照；Cell UI 与 Canvas adapter 共享同一检查出口 | [Core formatter](../packages/cell-core/src/index.test.ts)、[adapter parity](../scripts/quality/cell-frame-adapter-parity.test.ts) |
| P0.1 | Phase 0 / 上游地图 | 当前依赖、参考与未采用边界已有单一登记处 | [事实白板](README.md#当前上游关系)、[卡片规则](research/checklist.md) |
| P0.2 | Phase 0 / 架构收敛 | Compositor、SceneGeometry、事件、Portal、虚拟化与 SemanticSnapshot 的目标契约已定义 | [Compositor 蓝图](blueprints/compositor.md)、[Semantics 蓝图](blueprints/semantics.md) |
| P1.1 | Phase 1 / Headless Cell Engine | React descriptors、stable Widget Tree、Yoga Cell layout、SceneSnapshot 和 owner-aware CellBuffer 已形成 headless frame | [包契约](../packages/cell-ui/README.md)、[runtime tests](../packages/cell-ui/src/runtime.test.tsx) |
| P1.2 | Phase 1 / 几何与 chrome | border/decoration/content bounds、outer/content clip、nested scroll、paint/hit order 共用 SceneGeometry；Surface → Chrome → Content → Decoration 在全量和增量 paint 中保护 border | [Compositor 契约](blueprints/compositor.md)、[runtime tests](../packages/cell-ui/src/runtime.test.tsx) |
| P1.3 | Phase 1 / Yoga 生产资格 | Yoga Node 按 stable WidgetId 增量复用；整数/百分比/nested flex/Unicode measure、incremental=fresh、StrictMode/1000 次资源归零、10k 规模、Vite production 和 Chromium/WebKit CSP 均已验证 | [Yoga qualification tests](../packages/cell-ui/src/layout.test.tsx)、[performance tests](../packages/cell-ui/src/performance.test.tsx)、[browser tests](../packages/cell-ui/src/browser.dom.test.tsx)、[CSP E2E](../e2e/web-tui-csp.spec.ts) |
| P2.1 | Phase 2 / 首个交互切片 | List、Select、ScrollArea 可由鼠标、方向键、Enter 和 Semantic DOM action 操作 | [List 文档](web-tui/#/components/list)、[ScrollArea 文档](web-tui/#/components/scroll-area)、[browser E2E](../e2e/web-tui.spec.ts) |
| P3.1 | Phase 3 / 编辑状态 | CodeMirror EditorState 持有 UTF-16 文档与 history；grapheme、Cell 和 UTF-16 offset 可映射 | [CodeMirror 采用结论](research/codemirror.md)、[text tests](../packages/cell-ui/src/text.test.tsx) |
| P3.2 | Phase 3 / 浏览器输入 | 真实 textarea 接入 beforeinput、composition、paste/cut/copy；Canvas 支持 caret、selection 与 textbox semantics | [browser DOM tests](../packages/cell-ui/src/browser.dom.test.tsx)、[browser E2E](../e2e/web-tui-editor.spec.ts) |
| P3.3 | Phase 3 / 原生输入矩阵 | macOS 原生输入源与系统键盘已在 headed Chromium/WebKit 验证 ABC dead key、简体拼音 composition、含 emoji 的系统剪贴板、单次 undo，以及 textarea/Canvas 同步；验证器恢复输入源、剪贴板和前台应用 | [原生输入验证](verification/native-input.md)、[native input E2E](../e2e/web-tui-native-input.spec.ts)、[runner](../scripts/quality/run-cell-ui-native-input.mjs) |
| P4.0 | Phase 4 基础 / Cell Range | `CellSurface` 默认支持 macOS `⌥⌘`、其他平台 Alt 拖动选择最终 CellBuffer；跨行 wide-grapheme 定点闭包保证矩形边界不截断字符，并以纯文本复制边框、空白和内容 | [range tests](../packages/cell-ui/src/range.test.ts)、[browser DOM tests](../packages/cell-ui/src/browser.dom.test.tsx)、[complex widgets E2E](../e2e/web-tui-complex-widgets.spec.ts) |
| P4.1 | Phase 4 / Command Palette | Overlay portal 到 root Scene layer，同时保留逻辑 event parent；modal focus/semantics、restore、Escape、outside click、键盘和 pointer 共用 Widget state | [runtime tests](../packages/cell-ui/src/runtime.test.tsx)、[interaction tests](../packages/cell-ui/src/interaction.test.tsx)、[Chromium/WebKit E2E](../e2e/web-tui-command-palette.spec.ts) |
| P4.2 | Phase 4 / EventManager 与 gesture | pointer input 沿逻辑 event path capture/bubble；stop propagation/default 独立；pointer capture 跨 hit bounds 并在 owner 失效时 cancel；tap/drag/scroll arena 确定 winner 并取消 losers | [event tests](../packages/cell-ui/src/events.test.tsx)、[gesture tests](../packages/cell-ui/src/gestures.test.ts)、[browser DOM tests](../packages/cell-ui/src/browser.dom.test.tsx) |
| P4.3 | Phase 4 / Virtual List/Grid | 固定 Cell 二维 provider 在 100k-row/1000-column 数据上保持有界 cache window；stable-key anchor、reveal、bounded keepAlive、分页 focus、keyboard/pointer hit 和 browser List adapter 已接通 | [virtualization tests](../packages/cell-ui/src/virtual.test.ts)、[browser DOM tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit E2E](../e2e/web-tui-virtual-list.spec.ts) |
| P4.4 | Phase 4 / 复杂 Widget | Menu、Tree、Tabs 和 Grid 共用 Widget Tree、FocusManager、GestureManager、React Stately adapter 与 SemanticSnapshot；keyboard、Canvas pointer 和 semantic action 经同一 EngineInput 归一入口写回状态 | [headless widget tests](../packages/cell-ui/src/complex-widgets.test.tsx)、[browser DOM tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit E2E](../e2e/web-tui-complex-widgets.spec.ts) |
| P4.5 | Phase 4 / Cell-native UI 规范化 | focused/selected、按输入方式显示的 focus decoration、组件自有状态语言、renderer-owned chrome 与双轴 ScrollArea 已形成统一契约 | [UI 哲学](ui-philosophy.md)、[Widget 规范](blueprints/widgets.md)、[headless tests](../packages/cell-ui/src/interaction.test.tsx)、[browser tests](../packages/cell-ui/src/browser.dom.test.tsx) |
| P5.1 | Phase 5 / Accessibility 加固 | SemanticSnapshot audit 覆盖 role、name、state、focus、reading order、relations、actions 和虚拟集合位置；Semantic DOM 与 Headless 查询同源；keyboard/AT DOM focus、modal scope/restore 及 Chromium/WebKit 行为已验证 | [Accessibility 验收](verification/accessibility.md)、[semantic audit tests](../packages/cell-ui/src/semantics.test.tsx)、[browser tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit E2E](../e2e/web-tui-complex-widgets.spec.ts) |
| P5.2 | Phase 5 / 性能加固 | commit 按 tree/layout/geometry/paint/semantics/present 分级；paint-only 复用 Layout/Scene，scroll 复用 Layout；dirty Cell region 驱动增量 raster/present；Semantic focused ancestry 与 DOM children 使用一次性索引；10k/1000-scroll/120×40 预算可执行 | [runtime tests](../packages/cell-ui/src/runtime.test.tsx)、[performance tests](../packages/cell-ui/src/performance.test.tsx)、[semantic tests](../packages/cell-ui/src/semantics.test.tsx)、[browser tests](../packages/cell-ui/src/browser.dom.test.tsx) |
| P5.3 | Phase 5 / TestPilot | Headless Pilot 可执行 keyboard、pointer/gesture、semantic action、scroll、resize 与 idle barrier，并查询 frame、cells/text、scene、hit、focus 和 semantics；role/name 查询与 browser Semantic DOM 同源验证 | [Pilot tests](../packages/cell-ui/src/testing.test.tsx)、[browser parity tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Compositor 契约](blueprints/compositor.md#帧与检查) |
| P5.4 | Phase 5 / Cell 可检查性 | `CellBuffer.toText` 统一 Range、Probe、TestPilot 与 Browser 字符提取并保留 Unicode space/grapheme；versioned `CellProbeSnapshot` 提供无损 Cell JSON 和 owner/style/hit/clip/focus 诊断 | [probe tests](../packages/cell-ui/src/probe.test.tsx)、[range tests](../packages/cell-ui/src/range.test.ts)、[browser parity tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit E2E](../e2e/web-tui.spec.ts)、[包契约](../packages/cell-ui/README.md#cell-inspection) |
| P5.5 | Phase 5 / 字体能力路由 | Font Profile 将 display/CJK/Nerd/symbol/emoji face 与 Cell geometry 解耦；family、font scale、baseline 和 weight policy 贯通 Canvas、字体加载与 CellSurface | [字体能力栈](research/font-stack.md)、[font profile tests](../packages/fonts/src/index.test.ts)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[browser tests](../packages/cell-ui/src/browser.dom.test.tsx)、[font audit](../scripts/fonts/audit-font-capabilities.test.ts) |
| P5.6 | Phase 5 / 字体分发拆层 | `@chardesk/fonts` 仅分发 Nerd/symbol/emoji Core；`@chardesk/font-maple` 独立承载兼容显示层且 Profile 只把 Maple 用于 display/CJK；渲染默认使用 system Profile，现有产品显式选择 Maple | [Core package](../packages/fonts/README.md)、[Maple package](../packages/font-maple/README.md)、[manifests](../packages/fonts/manifest.json)、[字体能力栈](research/font-stack.md) |
| P5.7 | Phase 5 / Cell Unicode 投影 | `Cell.text` 是唯一前景；border/thumb 与内容均渲染 Unicode 字形，由 Profile 路由字体；Canvas、复制、Range、Probe 和 LLM 共用相同 Unicode | [顶层哲学](ui-philosophy.md)、[Compositor 契约](blueprints/compositor.md)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[probe tests](../packages/cell-ui/src/probe.test.tsx) |
| P5.8 | Phase 5 / 确定性产品网格 | `CellSurface`、CharDesk Canvas、`@chardesk/rendering` 与 Viewer 的产品默认值统一为 `9×20 / 15px / baseline 15`；字体加载只更新 readiness、字形与审计，不改变布局；绘制、命中、caret、Range、输入框与幻灯片几何共用稳定 metrics，显式 metrics 优先；持久化 v4/v5 与 Catalog v1-v3 的 viewport y 按 `20/19` 一次性迁移 | [应用网格权威](../src/shared/metrics/gridGeometry.ts)、[渲染契约](../packages/rendering/README.md#fixed-cell-grids-and-font-measurement)、[持久化迁移](../src/domains/sessions/persistence.test.ts)、[Catalog 迁移](../src/domains/sessions/indexedDbCatalog.test.ts)、[跨字体交互](../e2e/web-tui-font-metrics.spec.ts) |
| P5.10 | Phase 5 / 字体绘制契约 | 字形保留小数锚点，背景与裁剪独立对齐；resolver、加载、绘制共同遵守有效字重；Ark Mono 禁用合成粗体，Maple 保留粗体；真实 Ark ASCII 在 Chromium/WebKit 的 DPR 1、1.25、2 下通过字距、字重和编辑/Range 检查 | [绘制契约](../packages/rendering/README.md#fixed-cell-grids-and-font-measurement)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[真实字体测试](../e2e/web-tui-ark-mono.spec.ts)、[跨字体交互](../e2e/web-tui-font-metrics.spec.ts)、[正式字体与已知边界](../packages/font-ark/README.md) |
| P5.11 | Phase 5 / 字体网格适配审计 | Probe 区分字体原始尺寸、Profile 校准与实际 Surface 网格，缓存固定样本的字重、越格和理论断缝报告；通用校准、加载失败恢复与缓存失效由单元测试覆盖，真实 Ark Mono 验证浏览器报告 | [审计契约](../packages/rendering/README.md#font-grid-audit)、[Probe 消费](../packages/cell-ui/README.md#cell-inspection)、[审计测试](../packages/rendering/src/font-audit.test.ts)、[真实字体验证](../e2e/web-tui-font-audit.spec.ts) |
| P5.12 | Phase 5 / Ark 本地资源 | 私有 Ark 字体包固定官方 2026.09.01，含完整 WOFF2、OFL 与校验清单；Gallery 与测试消费同一 Ark 资源，按需加载、失败重试，加载 Ark 不产生第三方字体请求；15px 下 ASCII 宽 7.5px，部分边框/块/箭头为 15px，Probe 如实报告单 Cell 越格 | [资源事实](../packages/font-ark/README.md)、[离线校验](../scripts/fonts/ark-font.test.ts)、[加载回归](../e2e/web-tui-appearance.spec.ts)、[CSP 回归](../e2e/web-tui-csp.spec.ts) |
| P5.14 | Phase 5 / Nerd 字体分发 | Core 固定官方 Symbols Nerd Font Mono 3.5.1 与同版 10,617 码点 catalog；语义组按 96 KiB 上限递归切为 27 个互斥 shard；CSS、运行时识别和字符数据同源生成 | [Core 字体契约](../packages/fonts/README.md)、[字体事实](research/font-stack.md)、[切片测试](../scripts/fonts/nerd-font.test.ts)、[浏览器请求测试](../e2e/web-tui-nerd-font.spec.ts) |

## VERIFY

| ID | Phase / 切片 | 已有基础 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| P5.9 | Phase 5 / 完整字形试验 | Gallery 使用 `glyphOverflow="visible"`；保留 Cell 数据隔离，允许墨水越格，全 Surface 重绘防残影；默认消费方保持裁剪 | 根据完整字形的实际重叠效果决定组件像素隔离与后续重绘策略 | [CellSurface](../packages/cell-ui/README.md)、[越界墨水测试](../e2e/web-tui-glyph-overflow.spec.ts) |
| P5.13 | Phase 5 / Xiaolai Mono 试用 | Gallery 三字体切换，Xiaolai 固定本地 3.126；双浏览器、三个 DPR 的交互与 Probe 检查通过；Box/Block 不依赖显示字体 | 字体本身的完整 Unicode 覆盖与所有非结构字符适配尚未验证 | [试验事实](research/font-stack.md#gallery-当前试验)、[交互探针](../e2e/web-tui-font-metrics.spec.ts)、[加载恢复](../e2e/web-tui-xiaolai.spec.ts) |

## READY

| ID | Phase / 切片 | 目标 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| P6.1 | Phase 6 / 独立产品化 | 提供稳定公共 API、集成入口和发布契约 | public exports、版本策略、迁移文档、产品集成与发布自动化均有验证 | P1.3、P3.3、P5.1、P5.2、P5.3、P5.4 |

## BACKLOG / BLOCKED

当前没有 backlog 或已知外部阻塞。
