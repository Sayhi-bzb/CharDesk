# Glide Data Grid

[返回事实白板](../README.md)

## 当前关系

Glide Data Grid 当前未进入依赖图。大型二维虚拟化、selection、clipboard、damage 和 overlay editor 只作为产品行为对照。

## 本地边界

完整 DataEditor 自带 Canvas、scroll、focus、selection、events 和 accessibility，不是 Cell Engine Base。Foreign Surface 默认禁止；本项目不 deep-import 其内部 geometry、renderer 或 hit-test。

## 权威来源

[Glide repository](https://github.com/glideapps/glide-data-grid) · [API](https://github.com/glideapps/glide-data-grid/blob/main/packages/core/API.md)
