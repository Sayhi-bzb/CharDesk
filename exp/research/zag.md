# Zag.js：Widget 状态机能否脱离 DOM？

[返回线索白板](../README.md)

## 研究问题

Zag.js 能否直接提供 Select、Listbox、Menu、Dialog 和 ScrollArea 的 Cell-native interaction state？

## 产品形态

Zag 将组件交互建模为 framework-agnostic machine，再由 `connect()` 同时生成状态 API、ARIA/DOM props 和 DOM event handlers。这里的 framework-agnostic 不代表 DOM-agnostic。

## 可利用优势

- `@zag-js/collection` 提供 renderer-neutral 的 List、Tree、Grid collection、disabled、搜索和 next/previous navigation。
- Listbox 已覆盖单选、多选、highlight、disabled、typeahead、Home/End 和 grid navigation。
- Select、Menu、Dialog 的状态迁移、keyboard matrix 和 ARIA anatomy 可作为行为规范。
- Machine tests 能帮助补齐复杂 Widget 的边界，而无需照搬其视觉实现。

## 不足与风险

- Component machine 会查询 DOM、管理 focus、调用 `scrollIntoView()`、注册 document listener，并依赖 browser globals。
- Select/Menu 依赖 pixel placement、outside interaction 和 DOM geometry；Dialog 依赖 focus trap、aria-hidden 与 body scroll lock。
- `connect()` 没有把 behavior、semantics 和 DOM effects 分成稳定的独立接口。
- 依赖私有 machine event 会把我们绑定到 Zag 内部 contract。
- 让隐藏 DOM 成为 Zag 交互宿主会产生第二套 focus/event authority。

## 采用结论

状态：`条件后备`

完整 `@zag-js/listbox` 不是候选：公开 API 缺少明确的 anchor/range extension，完整语义依赖 DOM handlers。`@zag-js/collection` 只在 React Stately 不满足采用门槛或依赖成本不可接受时触发评估；其他 machine 仅作行为和 ARIA 蓝图。

## 后备触发条件

- 只允许公开 API；不得伪造 DOM event、调用私有 machine event 或复制内部 selection rules。
- `@zag-js/collection + 自有 adapter` 必须直接表达 anchor、extend range、disabled skip、Canvas command 和 composition gate。
- 仅当 React Stately 不满足采用门槛时比较 collection adapter；完整 Listbox machine 不进入比较。

## 权威来源

- [Zag introduction](https://zagjs.com/overview/introduction)
- [Building Machines](https://zagjs.com/guides/building-machines)
- [Collection](https://zagjs.com/guides/collection)
- [Listbox](https://zagjs.com/components/react/listbox)
- [Select](https://zagjs.com/components/react/select)
- [Zag repository](https://github.com/chakra-ui/zag)
