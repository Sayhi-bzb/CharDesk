# Web TUI Roadmap

本页拥有 Web TUI 的交付状态；规则与决策见文末权威入口。

## 维护规则

- 按可验收能力维护固定切片；修复、重构和扩展原位更新，不追加交付流水账。
- 每项只保留当前边界与权威入口；不记录历史编号、日期、测试数量或迁移过程。历史由 Git 保存。
- `DONE` 必须有可定位的验收证据；`VERIFY` 表示仍有明确验证门槛；`READY` 表示依赖已满足、尚未交付。
- 仅在存在实际条目时登记 `BACKLOG`（前置未完成）或 `BLOCKED`（明确外部阻塞）；不把局部完成当作阶段全部完成。

## 当前切片

| 阶段 / 能力 | 状态 | 当前边界 | 权威入口 |
| --- | --- | --- | --- |
| 0 / 上游与架构收敛 | DONE | 采用关系、职责边界与运行链路已有明确登记 | [事实白板](README.md) |
| 1 / Headless Engine 与布局合成 | DONE | React Widget Tree、Yoga 整数布局、Scene、裁剪与增量合成；布局及资源生命周期有验证 | [包契约](../packages/cell-ui/README.md)、[Compositor](blueprints/compositor.md) |
| 2 / 基础交互组件与 Gallery | DONE | 基础控件、Combobox、Accordion、Dialog 支持鼠标、键盘和语义操作；Gallery 提供用法与 Cell props 面板 | [Widget 规范](blueprints/widgets.md)、[Gallery 验证](../e2e/web-tui-components.spec.ts)、[Dialog 验证](../e2e/web-tui-dialog.spec.ts) |
| 3 / Unicode 编辑与浏览器输入 | DONE | 文档、历史、grapheme/Cell/UTF-16 映射及 IME/clipboard 接通；macOS 原生输入矩阵已验证 | [编辑契约](../packages/cell-ui/README.md)、[原生输入证据](verification/native-input.md) |
| 4 / 集合、浮层与虚拟化 | DONE | Menu/Tree/Tabs/Grid、模态焦点、独立浮层呈现及有界虚拟窗口可用 | [Widget 规范](blueprints/widgets.md)、[包契约](../packages/cell-ui/README.md) |
| 4–5 / Cell Range、复制与探针 | DONE | 矩形选择与复制保留边框、空白和 Unicode；TestPilot/Probe 支持字符、样式与几何检查 | [检查契约](../packages/cell-ui/README.md#cell-inspection)、[Range 验证](../packages/cell-ui/src/range.test.ts) |
| 5 / 统一状态、主题与 Cursor | DONE | 共享输入与交互底座；行为、反馈、外观分离；编辑器完整区域高亮及最终 Cell 颜色驱动 Cursor | [底座](blueprints/primitives.md)、[主题与 Cursor](../packages/cell-ui/README.md#theme-consumption) |
| 5–6 / 网格、字体与共享渲染 | DONE | 固定网格与字体加载解耦；Cell Core、Frame、Presenter 被 Cell UI 与主 Canvas 共用；字形越界策略见待验证项 | [渲染契约](../packages/rendering/README.md)、[字体事实](research/font-stack.md) |
| 5 / Accessibility 与性能 | DONE | 语义审计、焦点及双浏览器行为有验证；增量更新和大规模场景有自动化预算 | [Accessibility 边界](verification/accessibility.md)、[性能验证](../packages/cell-ui/src/performance.test.tsx) |
| 6 / 独立产品化 | READY | 共享底座已拆分并接入发布链路；Cell UI 的稳定 API、集成及发布契约尚未完成 | [Cell Core](../packages/cell-core/README.md)、[Cell UI](../packages/cell-ui/README.md) |

## 待验证与下一步

| 切片 | 状态 | 完成门槛 |
| --- | --- | --- |
| 字形越界策略 | VERIFY | Gallery 允许字形墨水越格，默认消费方保持裁剪；需确定组件像素隔离与重绘策略。[现有验证](../e2e/web-tui-glyph-overflow.spec.ts) |
| 独立产品化 | READY | 稳定公共 API、集成入口、版本策略、迁移文档及发布自动化均有验证；共享 Core 已发布不等于 Cell UI 产品化完成 |

## 规则与决策入口

- [事实白板](README.md)：产品约束、上游采用和架构所有权。
- [UI 哲学](ui-philosophy.md)：顶层设计原则与美学标准。
- [Widget 规范](blueprints/widgets.md)：状态、交互、编辑与滚动规则。
- [Cell Primitives 底座](blueprints/primitives.md)：输入、行为、反馈、外观与渲染的职责边界。
