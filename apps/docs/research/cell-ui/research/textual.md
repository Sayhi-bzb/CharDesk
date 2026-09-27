# Textual

[返回事实白板](../README.md)

## 当前关系

Textual 是 Compositor、分级失效、虚拟行、modal screen 和 headless Pilot 的行为参考；不进入运行时依赖图。

## 已消费的参考

SceneGeometry 独立拥有 visibility/clip/paint order，更新区分 layout/paint/recompose，TestPilot 使用固定 Cell viewport、逻辑输入和 idle barrier。

## 边界

本项目不采用 Python runtime、TCSS、Rich Strip、asyncio message pump 或 server-side Textual Web。React 仍拥有唯一 Widget Tree。

## 权威来源

[Textual repository](https://github.com/Textualize/textual) · [Testing](https://textual.textualize.io/guide/testing/) · [Compositor](https://github.com/Textualize/textual/blob/main/src/textual/_compositor.py)
