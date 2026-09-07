# Taffy

[返回事实白板](../README.md)

## 当前关系

Taffy 当前未进入依赖图；Yoga 是唯一布局实现。

## 本地边界

一棵 Widget Tree 不混用布局引擎。CSS Grid tracks/span/placement 不是当前公开契约；引入 Rust/WASM bridge 或第二套 layout tree 不属于现行产品切片。

## 权威来源

[Taffy repository](https://github.com/DioxusLabs/taffy) · [Layout rounding](https://doc.servo.org/taffy/fn.round_layout.html)
