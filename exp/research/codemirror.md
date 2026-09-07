# CodeMirror 6

[返回事实白板](../README.md)

## 当前关系

`@chardesk/cell-ui` 分层采用 `@codemirror/state`；依赖版本由 [package manifest](../../packages/cell-ui/package.json) 持有。

## 已消费能力

EditorState、Text、selection、ChangeSet、transaction 和 history 保存 UTF-16 文档状态。CharDesk 将 UTF-16 offset 投影为 grapheme 与整数 Cell geometry，并限制为单主 selection。

## 边界

不采用 `@codemirror/view`，也不让 DOM measurement、contenteditable、pixel geometry 或 View command 成为 Cell 布局权威。

## 权威来源

[Text state tests](../../packages/cell-ui/src/text.test.tsx) · [CodeMirror reference](https://codemirror.net/docs/ref/)
