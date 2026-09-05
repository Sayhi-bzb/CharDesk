# Glide Data Grid：能否成为大型 Grid 的现成肩膀？

[返回线索白板](../README.md) · [候选检查标准](checklist.md)

## 研究问题

Glide Data Grid 能否直接提供 React Canvas 大型 Grid，或贡献 Cell Engine 可迁移的虚拟化、交互和编辑能力？

## 肩膀高度

- 默认产品/架构高度：`B`
- 直接依赖高度：`C`
- 隔离 Foreign Surface 获准时：`A-`
- Engine Base 高度：`D`

## 可利用优势

- Canvas、lazy cell、native scrolling 和超浏览器 scroll-height 映射覆盖百万级行数。
- 主 Canvas、overlay Canvas、offscreen buffer、Cell damage 与局部 redraw/blit 是强性能参考。
- 二维 cell/row/column selection、keyboard、批量 clipboard、fill、drag、freeze、resize 和 span 形成完整产品 fixture。
- 数据由宿主持有，edit 与 controlled selection 通过 callback 回传。
- DOM portal editor 覆盖 validation、Escape、Enter/Tab movement、outside click 和 stay-on-screen。
- Accessibility tree 只覆盖可见窗口，而不是完整数据集。

## 不足与风险

- 公开 package 只有 DataEditor 根入口；scroll、renderer、hit-test 和 selection internals 不是稳定子包。
- Geometry、render、native scroller、focus、selection、events 和 accessibility 都由 DataEditor 自己拥有。
- 内部算法以 px、CanvasRenderingContext2D、DPR 和 DOM Rect 为权威，不能直接写入 CharDesk CellBuffer。
- 可见窗口 accessibility 仍接近 DOM-per-visible-cell，且官方承认其无障碍实现可能有缺陷。
- Overlay editor 没有成熟的 CJK/IME 保证；当前发布与 React 兼容状态需在采用时重新核验。

## 采用结论

状态：`条件后备`

不作为 Engine Base，也不 deep import 内部算法。若产品允许 Foreign Surface，可把完整 DataEditor 作为自带 Canvas/scroller/semantic subtree 的隔离 Grid Widget；否则只消费超大滚动、damage、selection、clipboard 和 editor behavior fixtures。

## Foreign Surface 采用门槛

- 宿主 store 必须是数据与 selection 唯一权威，每个动作只产生一次 transition。
- CJK composition、copy/paste、touch、NVDA/VoiceOver 和 React 目标版本全部通过。
- Foreign Surface 有明确 focus handoff、bounds、modal/overlay 与 SemanticSnapshot 边界。
- 若所有可见内容必须经过统一 CellBuffer，或无法避免双 focus/event/selection，则直接淘汰集成方案。

## 权威来源

- [Glide Data Grid repository](https://github.com/glideapps/glide-data-grid)
- [Core package](https://github.com/glideapps/glide-data-grid/blob/main/packages/core/package.json)
- [API](https://github.com/glideapps/glide-data-grid/blob/main/packages/core/API.md)
- [Copy and paste](https://docs.grid.glideapps.com/extended-quickstart-guide/copy-and-paste-support)
- [Base grid cell](https://docs.grid.glideapps.com/api/cells/basegridcell)
- [CJK issue](https://github.com/glideapps/glide-data-grid/issues/1179)
