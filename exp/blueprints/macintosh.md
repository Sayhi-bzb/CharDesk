# Classic Macintosh → Cell UI

[返回事实白板](../README.md) · [UI 哲学](../ui-philosophy.md) · [Widget 规范](widgets.md)

本页拥有一个问题：System 6–7 的视觉与交互原则如何翻译为 Cell-native Web UI。事实基准是 Apple 1992 年的 [Macintosh Human Interface Guidelines](https://vintageapple.org/inside_r/pdf/Human_Interface_Guidelines_1992.pdf)。

## 设计标准

- **直接操作**：目标在操作期间保持可见，结果与反馈出现在原对象上。
- **即时反馈**：down、commit、长期运行和失败使用不同状态；输入被接受后立即可见。
- **感知稳定**：对象、布局、焦点和选择不因短暂反馈跳位；不可用能力变暗而不消失。
- **宽容与用户控制**：优先可撤销操作；取消 transient state 不回滚已提交业务值。
- **少模态**：只在行为确实需要独占输入时建立 scope，并始终提供明确退出路径。
- **审美完整性**：黑白状态语言必须独立成立；颜色只作冗余增强，不承担唯一语义。
- **一致性**：相同状态使用相同 token、时序和字符语法，组件不私有化公共反馈。

## Cell-native 翻译

- Macintosh 决定交互与视觉层级；Everything is Cell 决定整数布局、字符 chrome、Canvas paint、hit、copy 和 probe。
- Light 是 System 6–7 正典；Dark 是同一黑白层级的系统反相，不声称历史复刻。
- 状态优先级从高到低为 disabled → transient inverse → selected → keyboard focus → hover。Disabled 拒绝 transient feedback；press/activation 反相最终解析样式；selected 决定持久背景；focus 增加 bold；hover 只在无 focus/selection/disabled 时出现。
- Pointer hover 是 Web 可发现性适配，只改变 paint，不改变布局、command 或业务 state。
- Button variant 必须在静止状态可区分：default 使用高对比 primary surface，outline 使用字符边框，ghost 保持透明。Primary hover 使用同向的轻微明度变化；disabled 退回普通 surface，press 与 activation feedback 反相最终有效颜色。
- Maple Mono 9×20 仍是默认 Cell metrics。Chicago-like 字体属于后续独立 preset。
- Semantic DOM、keyboard、touch、IME、reduced motion 与 accessibility 是现代 Host 契约，不以历史行为降级。

## 当前边界

本标准当前适用于 `@chardesk/cell-ui` 与 Web TUI Gallery。具体组件的经典窗口阴影、默认按钮双框、滚动箭头和菜单几何尚未采用；CharDesk 主产品 Host 不在本轮迁移范围。
