# Zag.js

[返回事实白板](../README.md)

## 当前关系

Zag.js 当前未进入依赖图。Widget behavior 和 ARIA anatomy 仅作为对照。

## 本地边界

完整 machine/connect 路径拥有 DOM query、focus、scroll、outside interaction 和 event handlers，会形成第二套交互权威。Collection/selection 主线由 React Stately adapter 承担；本项目不使用 Zag 私有事件或伪造 DOM event。

## 权威来源

[Zag repository](https://github.com/chakra-ui/zag) · [Collection](https://zagjs.com/guides/collection) · [Listbox](https://zagjs.com/components/react/listbox)
