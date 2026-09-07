# xterm.js

[返回事实白板](../README.md)

## 当前关系

xterm.js 是 browser terminal 的 IME、selection、accessibility、viewport 和 dirty rendering 参考；不作为 Web TUI Engine Base。

## 已消费的参考

hidden textarea、composition、wide-cell selection、px-to-grid 边界、可见行语义投影和 renderer dirty-row 分层。

## 边界

本项目不采用 VT-owned buffer、terminal cursor/scrollback、私有 renderer services 或 Unicode addon。只有独立 PTY Terminal Widget 才会直接消费完整 xterm package。

## 权威来源

[xterm.js repository](https://github.com/xtermjs/xterm.js) · [Public API](https://xtermjs.org/docs/api/terminal/classes/terminal/) · [Screen Reader design](https://github.com/xtermjs/xterm.js/wiki/Design-Document%3A-Screen-Reader-Mode)
