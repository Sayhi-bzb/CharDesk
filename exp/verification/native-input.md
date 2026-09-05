# Web TUI 原生输入验证

本页登记 P3.3 的目标桌面输入证据。编辑状态与合成事件测试分别由 [`text.test.tsx`](../../packages/cell-ui/src/text.test.tsx) 和 [`browser.dom.test.tsx`](../../packages/cell-ui/src/browser.dom.test.tsx) 负责；本页只负责 macOS 输入系统到真实浏览器 textarea 的边界。

## 验证命令

```sh
npm run test:cell-ui:native-input
```

命令在 headed Chromium 和 WebKit 中串行验证：

- ABC dead key 生成 `é`；
- 简体拼音通过 composition 生成 `你`；
- 系统 paste 输入的 Unicode emoji 不被拆分；
- 系统 paste、copy、cut 保持中英文和 emoji；
- 一次系统 Undo 撤销一次完整 composition；
- textarea 值与 Canvas Cell projection 同步。

验证器会保存当前输入源、剪贴板与前台应用，并在通过或失败后恢复。执行需要交互式 macOS 桌面，以及当前 Codex host 在“系统设置 → 隐私与安全性 → 辅助功能”中的键盘控制权限。

## 目标矩阵

| 环境 | 状态 | 证据 |
| --- | --- | --- |
| macOS 26.2 原生输入 → Chromium 147.0.7727.15 | PASS | 2026-09-05：headed native-input E2E 通过 |
| macOS 26.2 原生输入 → WebKit 26.4 | PASS | 2026-09-05：headed native-input E2E 通过 |

两行均由 `npm run test:cell-ui:native-input` 的同一可重复验证器产生；分项目复核亦通过。验证结束后输入源恢复为执行前的 `com.apple.inputmethod.SCIM.Shuangpin`。
