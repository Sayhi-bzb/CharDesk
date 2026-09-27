# egui / eframe

[返回事实白板](../README.md)

## 当前关系

egui/eframe 是 stable ID、interaction ownership、Web input 和 semantic-query testing 的参考；不进入依赖图。

## 已消费的参考

stable ID、intent/response 分离、layer/modal/focus/drag/IME owner、demand repaint，以及按 role/name 查询同一 accessibility tree 的测试方式。

## 边界

本项目不采用 immediate-mode runtime、Rust/WASM、float geometry、tessellation 或 AccessKit Web adapter。React/SceneGeometry/Stately 保持唯一权威。

## 权威来源

[egui architecture](https://github.com/emilk/egui/blob/main/ARCHITECTURE.md) · [egui_kittest](https://docs.rs/egui_kittest/latest/egui_kittest/) · [AccessKit](https://github.com/AccessKit/accesskit)
