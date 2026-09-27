# React Three Fiber

[返回事实白板](../README.md)

## 当前关系

R3F 是 non-DOM React Host、event manager、portal、demand frame 和 test renderer 的契约参考；不进入依赖图。

## 已消费的参考

Host instance 与视觉 Cell 分离、commit 后合并 invalidation、hit/path/capture 分层、portal 使用独立 scene parent，以及无 WebGL test renderer 的接口形态。

## 边界

本项目不采用 Three.js scene、raycasting、WebGL renderer、R3F event semantics 或 custom reconciler。它们不能成为第二套 scene/event authority。

## 权威来源

[R3F repository](https://github.com/pmndrs/react-three-fiber) · [Events](https://r3f.docs.pmnd.rs/api/events) · [On-demand rendering](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
