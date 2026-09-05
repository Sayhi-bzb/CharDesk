# Ink：React Host 能否迁移到浏览器 Cell Engine？

[返回线索白板](../README.md)

## 研究问题

Ink 的 custom React renderer、Host Tree、Yoga integration 和 frame lifecycle 中，哪些适合迁移到 Browser Cell Engine？

## 产品形态

Ink 是 Node terminal 的 React renderer。React mutation commit 更新轻量 Host Tree并同步 Yoga Tree，commit 完成后统一 layout、paint 到虚拟 Output，再 flush 为 terminal frame。

## 可利用优势

- Host Node 对应 root/box/text，而不是 Cell，证明 React Widget Tree 无需 DOM-per-cell。
- Inline/virtual text run 不创建独立 Yoga Node，可用于设计 Text 与 styled run 边界。
- Text content 变化标记最近的 measured Yoga ancestor dirty。
- `resetAfterCommit` 后统一 layout/paint，适合 frame coalescing 和避免 mutation 中途绘制。
- Testing Library 的 `lastFrame()`、rerender、input 和 flush 模型适合翻译为 Cell Buffer 测试工具。
- DevTools integration 可作为自有 renderer 的调试入口参考。

## 不足与风险

- Ink package 直接耦合 Node streams、raw mode、ANSI、TTY resize 和 process lifecycle，没有 backend adapter。
- Output 和 incremental rendering 面向 terminal string/line diff，不适合 canonical Cell Buffer。
- Focus 只是 Context 中的有序 ID，不覆盖 browser DOM focus、scope、trap、pointer 和 semantic mirror。
- Input 不处理 Web composition、hidden textarea 或移动端输入。
- `react-reconciler` 是实验接口，HostConfig 和同步 API 会随 React 版本变化。

## 采用结论

状态：`仅作蓝图`

不依赖或 fork Ink。翻译其 Host Tree、Text/virtual-text、Yoga 同步和 commit-to-frame 模式；把 `react-reconciler` 隔离在单一内部 React Host package。

## 可迁移契约

- root/box/text 三种 primitive 覆盖 React mount、update、reorder 和 unmount。
- 一个 commit 最多触发一次 layout/paint，连续 state update 合并为一帧。
- Text dirty 不重建无关 Host/Yoga Node。
- Host 支持 React DevTools 和无 DOM Cell snapshot。

## 权威来源

- [Ink repository](https://github.com/vadimdemedes/ink)
- [Host Tree](https://github.com/vadimdemedes/ink/blob/master/src/dom.ts)
- [React reconciler](https://github.com/vadimdemedes/ink/blob/master/src/reconciler.ts)
- [Output](https://github.com/vadimdemedes/ink/blob/master/src/output.ts)
- [ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)
- [React reconciler status](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md)
