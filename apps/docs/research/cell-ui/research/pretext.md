# Pretext

[返回事实白板](../README.md)

## 当前关系

Pretext 是文本准备、range materialization 和语料验证的参考；不进入依赖图。

## 已消费的参考

文本分析与 viewport layout 分离、缓存 segment 结果、按可见 range 生成字符串，以及多语言 correctness/benchmark 语料。

## 边界

Pretext 的 Canvas pixel measurement 不决定 Cell width。`@chardesk/protocol` 是 grapheme 与 1/2 Cell geometry 的唯一权威。

## 权威来源

[Pretext repository](https://github.com/chenglou/pretext) · [Research data](https://github.com/chenglou/pretext/blob/main/status/dashboard.json)
