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
| P5.15 | Phase 5 / Core 边框路由 | Cell UI 的 Box/Block 统一使用 JuliaMono Regular，正文保留选定字体；加载、绘制和 Probe 共用有效 Profile；主 Canvas 默认路由不变 | [Surface 契约](../packages/cell-ui/README.md)、[路由测试](../packages/cell-ui/src/browser-font-profile.test.ts)、[三字体绘制检查](../e2e/web-tui-block-glyphs.spec.ts) |
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
| P5.7 | Phase 5 / Cell Unicode 投影 | `Cell.text` 是唯一前景；border/thumb 与内容均由当前 display font 渲染，Canvas、复制、Range、Probe 和 LLM 共用相同 Unicode | [顶层哲学](ui-philosophy.md)、[Compositor 契约](blueprints/compositor.md)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[probe tests](../packages/cell-ui/src/probe.test.tsx) |
| P5.8 | Phase 5 / 确定性网格 | `CellSurface` 默认 `9×20 / 15px / baseline 15` 在首帧同步确定，与通用 Canvas 的兼容默认值分离；字体加载只更新 readiness、字形与审计，不改变 Surface；绘制、命中、caret、Range 与输入框共用稳定尺寸，显式 metrics 优先 | [网格契约](../packages/cell-ui/README.md)、[字体生命周期](../packages/cell-ui/src/browser-font-metrics.dom.test.tsx)、[跨字体交互](../e2e/web-tui-font-metrics.spec.ts) |
| P5.10 | Phase 5 / 字体绘制契约 | 字形保留小数锚点，背景与裁剪独立对齐；resolver、加载、绘制共同遵守有效字重；Ark Mono 禁用合成粗体，Maple 保留粗体；真实 Ark ASCII 在 Chromium/WebKit 的 DPR 1、1.25、2 下通过字距、字重和编辑/Range 检查 | [绘制契约](../packages/rendering/README.md#fixed-cell-grids-and-font-measurement)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[真实字体测试](../e2e/web-tui-ark-mono.spec.ts)、[跨字体交互](../e2e/web-tui-font-metrics.spec.ts)、[正式字体与已知边界](../packages/font-ark/README.md) |
| P5.11 | Phase 5 / 字体网格适配审计 | Probe 区分字体原始尺寸、Profile 校准与实际 Surface 网格，缓存固定样本的字重、越格和理论断缝报告；通用校准、加载失败恢复与缓存失效由单元测试覆盖，真实 Ark Mono 验证浏览器报告 | [审计契约](../packages/rendering/README.md#font-grid-audit)、[Probe 消费](../packages/cell-ui/README.md#cell-inspection)、[审计测试](../packages/rendering/src/font-audit.test.ts)、[真实字体验证](../e2e/web-tui-font-audit.spec.ts) |
| P5.12 | Phase 5 / Ark 本地资源 | 私有 Ark 字体包固定官方 2026.09.01，含完整 WOFF2、OFL 与校验清单；Gallery 与测试消费同一 Ark 资源，按需加载、失败重试，加载 Ark 不产生第三方字体请求；15px 下 ASCII 宽 7.5px，部分边框/块/箭头为 15px，Probe 如实报告单 Cell 越格 | [资源事实](../packages/font-ark/README.md)、[离线校验](../scripts/fonts/ark-font.test.ts)、[加载回归](../e2e/web-tui-appearance.spec.ts)、[CSP 回归](../e2e/web-tui-csp.spec.ts) |
| P5.14 | Phase 5 / Nerd 字体分发 | Core 固定官方 Symbols Nerd Font Mono 3.5.1 与同版 10,617 码点 catalog；语义组按 96 KiB 上限递归切为 27 个互斥 shard；CSS、运行时识别和字符数据同源生成 | [Core 字体契约](../packages/fonts/README.md)、[字体事实](research/font-stack.md)、[切片测试](../scripts/fonts/nerd-font.test.ts)、[浏览器请求测试](../e2e/web-tui-nerd-font.spec.ts) |

## VERIFY

| ID | Phase / 切片 | 已有基础 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| P5.9 | Phase 5 / 完整字形试验 | Gallery 使用 `glyphOverflow="visible"`；保留 Cell 数据隔离，允许墨水越格，全 Surface 重绘防残影；默认消费方保持裁剪 | 根据完整字形的实际重叠效果决定组件像素隔离与后续重绘策略 | [CellSurface](../packages/cell-ui/README.md)、[越界墨水测试](../e2e/web-tui-glyph-overflow.spec.ts) |
| P5.13 | Phase 5 / Xiaolai Mono 试用 | Gallery 三字体切换，Xiaolai 在线 CSS 标注 3.126；双浏览器、三个 DPR 的交互与 Probe 检查通过 | 完整覆盖与实际墨水接缝未获得正式兼容结论；Core `█` 墨迹仍小于 20px 行高 | [试验事实](research/font-stack.md#gallery-当前试验)、[交互探针](../e2e/web-tui-font-metrics.spec.ts)、[加载恢复](../e2e/web-tui-xiaolai.spec.ts) |

## READY

| ID | Phase / 切片 | 目标 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| P6.1 | Phase 6 / 独立产品化 | 提供稳定公共 API、集成入口和发布契约 | public exports、版本策略、迁移文档、产品集成与发布自动化均有验证 | P1.3、P3.3、P5.1、P5.2、P5.3、P5.4 |

## BACKLOG / BLOCKED

当前没有 backlog 或已知外部阻塞。
