# React Aria/Stately：状态与 Semantic DOM 能否共用？

[返回线索白板](../README.md)

## 研究问题

React Stately 能否成为 collection/selection 状态上游，React Aria 能否只服务 Semantic DOM，同时保持 Canvas 与 DOM 单一状态权威？

## 产品形态

Adobe 将跨平台 React Stately state、Web React Aria behavior、React Aria Components DOM composition 和 Spectrum visual system 分层。Stately 管理 collection/selection；Aria hooks 接收 HTMLElement ref 并返回 DOM/ARIA props 与 browser handlers。

## 可利用优势

- React Stately 提供 keyed collection、SelectionManager、focused key、disabled keys、单选、多选、range selection 和 controlled state。
- ListBox hooks 允许提供 keyboard/layout delegate、virtual focus 和 virtualized metadata，存在 Cell adapter 的公开扩展点。
- Semantic DOM 可以按 Widget/Item 而非 Cell生成，并通过 `aria-activedescendant` 表达 Cell list focus。
- React Aria 对 VoiceOver、JAWS、NVDA、TalkBack、touch、keyboard、RTL 和多语言有成熟验证。
- Select 的 HiddenSelect 可保留 form、autofill、mobile 和 screen reader 能力，同时 Cell Engine 自己布局 popup。

## 不足与风险

- React Aria hooks 仍依赖 DOM ref、event、focus 与部分 scroll behavior，不能进入 Cell Core。
- React Aria Components 通常一组件对应一个 DOM element，会复制完整 Widget Tree。
- FocusScope、Popover positioning 和 Virtualizer 使用真实 DOM、DOMRect、px 与 ResizeObserver。
- Canvas 与 Semantic DOM 若各自保存 selection/focus，会产生双状态和重复 event。
- 大型虚拟列表能否只保留 visible items 与 focused item，同时可靠读屏，必须跨平台验证。

## 采用结论

状态：`分层采用`

React Stately List/Selection 是状态主线；React Aria ListBox hooks 只允许进入 browser-semantic adapter。React Aria Components、Virtualizer、Popover positioning、核心 FocusScope 和完整 Zag Listbox 不采用。

## 状态边界

```text
Engine InputRouter → Listbox commands → React Stately
                                      ├─ Canvas paint
                                      └─ Semantic DOM
```

- Adapter 快照只暴露 mode、focused key、selected keys、anchor key 和 composing；不泄露 Stately 类型。
- Canvas pointer 通过 Cell hit test 调用 adapter command，不触发 DOM `.click()`。
- Keyboard、IME 与 typeahead 只由 InputRouter 消费一次；辅助技术 action 进入同一 command path并去重。
- DOM focus 固定在 proxy/listbox root，item 使用 virtual focus 与 `aria-activedescendant`。

## 采用门槛

- 7-item fixture 覆盖 disabled、single/multiple、range、base-sensitive typeahead、Canvas click 与 composition gate。
- 每个动作只能产生一次 transition/onChange；Canvas focused/selected 与 ARIA state 每次 commit 一致。
- 10k virtual list 的 DOM/Scene nodes 只随 visible + overscan 增长，active descendant 在 commit 后始终存在。
- 核心增量 gzip 与 Semantic bridge 分别以 25 KB、35 KB 为淘汰门槛；先验证聚合包 tree-shaking，再考虑公开 scoped package。
- 禁止 private import/event、px geometry 和 DOM scroll 成为状态或布局权威。

## 权威来源

- [React Spectrum repository](https://github.com/adobe/react-spectrum)
- [Architecture RFC](https://github.com/adobe/react-spectrum/blob/main/rfcs/2019-v3-architecture.md)
- [React Aria](https://react-spectrum.adobe.com/react-aria/)
- [React Stately List](https://react-aria.adobe.com/useListState)
- [ListBox](https://react-aria.adobe.com/ListBox/useListBox)
- [Select](https://react-aria.adobe.com/Select/useSelect)
- [Quality and testing](https://react-aria.adobe.com/quality)
