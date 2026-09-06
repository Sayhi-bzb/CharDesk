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
| P0.1 | Phase 0 / 上游地图 | 候选职责、采用结论和进入依赖图的门槛已有单一登记处 | [事实白板](README.md#上游地图)、[候选检查标准](research/checklist.md) |
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
| P5.3 | Phase 5 / TestPilot | Headless Pilot 可执行 keyboard、pointer/gesture、semantic action、scroll、resize 与 idle barrier，并查询 frame、cells/text、scene、hit、focus 和 semantics；role/name 查询与 browser Semantic DOM 同源验证 | [Pilot tests](../packages/cell-ui/src/testing.test.tsx)、[browser parity tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Compositor 契约](blueprints/compositor.md#headless-testsurface) |
| P5.4 | Phase 5 / Cell 可检查性 | `CellBuffer.toText` 统一 Range、Probe、TestPilot 与 Browser 字符提取并保留 Unicode space/grapheme；versioned `CellProbeSnapshot` 提供无损 Cell JSON 和 owner/style/hit/clip/focus 诊断 | [probe tests](../packages/cell-ui/src/probe.test.tsx)、[range tests](../packages/cell-ui/src/range.test.ts)、[browser parity tests](../packages/cell-ui/src/browser.dom.test.tsx)、[Chromium/WebKit E2E](../e2e/web-tui.spec.ts)、[包契约](../packages/cell-ui/README.md#cell-inspection) |
| P5.5 | Phase 5 / 字体能力路由 | Font Profile 将 display/CJK/Nerd/symbol/emoji face 与 Cell geometry 解耦；family、font scale、baseline 和 weight policy 贯通 Canvas、字体加载与 CellSurface | [字体能力栈](research/font-stack.md)、[font profile tests](../packages/fonts/src/index.test.ts)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[browser tests](../packages/cell-ui/src/browser.dom.test.tsx)、[font audit](../scripts/fonts/audit-font-capabilities.test.ts) |
| P5.6 | Phase 5 / 字体分发拆层 | `@chardesk/fonts` 仅分发 Nerd/symbol/emoji Core；`@chardesk/font-maple` 独立承载兼容显示层且 Profile 只把 Maple 用于 display/CJK；渲染默认使用 system Profile，现有产品显式选择 Maple | [Core package](../packages/fonts/README.md)、[Maple package](../packages/font-maple/README.md)、[manifests](../packages/fonts/manifest.json)、[字体能力栈](research/font-stack.md) |
| P5.7 | Phase 5 / Cell 几何投影 | `Cell.text` 保持可复制字符真值；组件 border/thumb 携带显式 line/fill primitive，Canvas 以设备像素对齐的连续几何绘制；未标记的用户字符仍走字体 | [Compositor 契约](blueprints/compositor.md)、[Canvas tests](../packages/rendering/src/canvas.test.ts)、[border tests](../packages/cell-ui/src/border.test.tsx)、[probe tests](../packages/cell-ui/src/probe.test.tsx) |

## VERIFY

| ID | Phase / 切片 | 已有基础 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| — | 无 | 当前没有等待专项结论的切片 | — | — |

## READY

| ID | Phase / 切片 | 目标 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| P6.1 | Phase 6 / 独立产品化 | 提供稳定公共 API、集成入口和发布契约 | public exports、版本策略、迁移文档、产品集成与发布自动化均有验证 | P1.3、P3.3、P5.1、P5.2、P5.3、P5.4 |

## BACKLOG

| ID | Phase / 切片 | 目标 | 完成门槛 | 依赖 |
| --- | --- | --- | --- | --- |
| — | 无 | 当前没有未满足前置依赖的切片 | — | — |

## BLOCKED

| ID | 切片 | 阻塞事实 |
| --- | --- | --- |
| — | 无 | 没有已知外部条件阻止 `READY` 切片实施 |
