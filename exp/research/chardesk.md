# CharDesk：现有能力能否直接复用？

[返回线索白板](../README.md)

## 研究问题

现有 CharDesk 架构中，哪些能力可以直接成为 Web TUI Engine 的依赖，哪些需要先公共化？

## 已有形态

CharDesk 已经拥有可编辑 Cell Canvas、文本协议、共享 Canvas renderer 和只读 Viewer。它解决的是字符网格文档的存储、渲染与交互，还不是通用 Widget Runtime。

## 可直接复用

- [`@chardesk/protocol`](../../packages/protocol/README.md)：grapheme segmentation、确定性 Unicode Cell width、文本宽度、Cell/Row/Run 类型和 ANSI 文本解析。
- [`@chardesk/rendering`](../../packages/rendering/README.md)：固定 Canvas metrics、字体路由、Cell visual、相邻样式 run 聚合和 Canvas 2D primitives。
- [`@chardesk/fonts`](../../packages/fonts/README.md)：Text/Emoji 字体配置与消费边界。

这些能力已有 package 公共入口，实验应作为依赖消费，而不是复制源文件。

## 需要先公共化

- Viewer 内部的 Grid hit testing、双宽 follower normalization 和 rectangular selection。
- Canvas Editor 内部的 managed textarea、IME composition、clipboard 和 focus coordination。
- Host 内部的 shortcut dispatch 只有在证明适合通用 Widget Tree 后才提取。

## 不足与风险

- Canvas 当前围绕文档和编辑器组织，没有 Row、Column、Box、Select、ScrollArea 等通用 Widget。
- Viewer 主要处理单文档、单 viewport，尚无嵌套 clip、scroll、overlay 和 Widget 事件传播。
- 现有 ARIA 实践属于普通 Host DOM；没有由 Cell Widget Tree 生成 Semantic Tree 的通用机制。

## 采用结论

状态：`可直接复用`

CharDesk 是 Unicode/Cell 与 Browser Canvas 的实现基础。Web TUI 实验应补充 Widget Runtime，并把验证过的通用交互能力提升到拥有它们的 package，而不是把 `src/` 内部实现搬进 `exp/`。

## 未拥有能力

- `@chardesk/rendering` 的 Cell Scene 类型尚未表达 Widget ownership、clip 和 z-index。
- managed textarea 尚未抽象为多 Widget Input Manager。
- Viewer Grid Interaction 尚无明确的公共 package 所有权。

## 权威来源

- [Protocol API](../../packages/protocol/README.md)
- [Rendering API](../../packages/rendering/README.md)
- [Ownership and dependency direction](../../apps/docs/content/docs/development/architecture/ownership.mdx)
