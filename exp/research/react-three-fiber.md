# React Three Fiber：Browser React Host 能借什么？

[返回线索白板](../README.md)

## 研究问题

React Three Fiber 的 non-DOM Host、scene events、portal、demand rendering 和 test renderer 能否迁移到 Cell Engine？

## 产品形态

R3F 是 React 到 Three.js Scene Graph 的 custom renderer。React mutation commit 维护 Host Instance tree，commit 后统一 invalidation；event manager 把浏览器事件、raycast hit 和 scene propagation 分层。

## 可利用优势

- Host Instance 对应 Scene Object 而不是 DOM/pixel，可映射为 React Node 对应 Cell Widget。
- Props diff 与 Host lifecycle 可转化为 layout、paint、event、semantic 四类 dirty flag。
- Demand frameloop 只在 invalidation 后启动 RAF，静止 scene 不持续绘制。
- EventManager 分离 native target、hit test、handler path、priority 和 pointer capture。
- Portal 使用继承 root state 的独立 scene/layer，适合 Dialog、Menu 和 Tooltip overlay。
- Test Renderer 在无 WebGL 环境提供 tree、graph、event、update、unmount 和 manual frame。

## 不足与风险

- Three Object3D、Camera、Raycaster、WebGLRenderer 和 props semantics 贯穿核心，没有通用 Host 子包。
- R3F pointer capture 与 DOM 标准存在差异，不应直接复制其命中合并行为。
- `@react-three/test-renderer` 仍依赖 R3F/Three，只能翻译接口形态。
- `react-reconciler` 是实验 API；React 19 小版本已迫使 R3F 内置匹配的 reconciler。
- 引入 R3F 或 `@pixi/react` 都会建立第二套 Scene Tree。

## 采用结论

状态：`仅作蓝图`

不依赖 R3F。与 Ink 互补使用：Ink 指导 Text/Yoga/frame，R3F 指导 browser root、events、portal、demand scheduling 和 test renderer。`react-reconciler` 只允许存在于锁版本的内部 Host adapter，并保留普通 React descriptor fallback。

## Reconciler 采用门槛

- Host mutation 只维护 Widget Tree/dirty flags，并在 commit 后合并为一次 frame。
- px-to-Cell 后的 top-hit、capture、bubble 和 stop propagation 独立于 Canvas scene。
- Overlay portal 共享 theme/focus/event service，同时拥有独立 clip 与 z-layer。
- 锁版本 adapter 的 React 升级成本低于普通 React descriptor 方案。

## 权威来源

- [React Three Fiber repository](https://github.com/pmndrs/react-three-fiber)
- [Reconciler source](https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/reconciler.tsx)
- [Events source](https://github.com/pmndrs/react-three-fiber/blob/master/packages/fiber/src/core/events.ts)
- [Events documentation](https://r3f.docs.pmnd.rs/api/events)
- [On-demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Test Renderer](https://github.com/pmndrs/react-three-fiber/tree/master/packages/test-renderer)
- [React reconciler status](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md)
