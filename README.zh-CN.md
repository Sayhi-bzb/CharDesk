[English](./README.md) | [简体中文]

# CharDesk

> **人类与语言模型共享的视觉媒介。**

CharDesk 把 Unicode 文本变成共享工作区：人看到画布，Agent 编辑 token。

[打开 CharDesk](https://chardesk.com/) · [探索 CharGraph](https://chardesk.com/chargraph/) · [CLI 文档](packages/cli/README.md)

## 从 Agent 开始

需要 Node.js 20 或更高版本。

```sh
npx skills add https://github.com/sayhi-bzb/chardesk --skill chardesk
npm install -g @chardesk/cli
```

然后直接告诉 Agent 你想看到什么：

```text
$chardesk 用一块可视化黑板解释显卡如何工作。
```

Agent 会创建源码、检查结果并打开画布。你不需要先学习文件格式，也不需要配置 AI Provider。

## 可以用它做什么

- 把概念讲成一段空间叙事，而不是堆成一堵文字墙。
- 用字符幻灯片呈现想法。
- 用曲线、公式、数据和标注制作科研图。
- 设计界面、终端、仪表盘和产品状态。
- 描绘架构、流程、时间线与关系。
- 保留一块人和 Agent 都能检查、继续修改的 Blackboard。

[![CharDesk 作为人与 Agent 共享的视觉媒介](public/showcase/01-shared-medium.png)](demo/readme-showcase/01-shared-medium.md)

**共享视觉媒介** · [源码](demo/readme-showcase/01-shared-medium.md)

[![显卡工作原理的可视化讲解](public/showcase/02-gpu-blackboard.zh-CN.png)](demo/readme-showcase/02-gpu-blackboard.zh-CN.md)

**可视化讲解** · [源码](demo/readme-showcase/02-gpu-blackboard.zh-CN.md)

[![厄尔尼诺科研图](public/showcase/03-el-nino-observatory.png)](demo/readme-showcase/03-el-nino-observatory.md)

**科研图** · [源码](demo/readme-showcase/03-el-nino-observatory.md)

[![字符幻灯片叙事](public/showcase/04-story-slides.ja.png)](demo/readme-showcase/04-story-slides.ja.md)

**字符 Slides** · [源码](demo/readme-showcase/04-story-slides.ja.md)

[![ANSI 与 Nerd Font 产品界面](public/showcase/05-interface-console.png)](demo/readme-showcase/05-interface-console.md)

**界面设计** · [源码](demo/readme-showcase/05-interface-console.md)

[![人与 Agent 共享的 Blackboard](public/showcase/06-agent-blackboard.png)](demo/readme-showcase/06-agent-blackboard.md)

**Agent Blackboard** · [源码](demo/readme-showcase/06-agent-blackboard.md)

### ANSI 界面实验

[![上下文控制室](public/showcase/07-context-control-room.png)](demo/readme-showcase/07-context-control-room.md)

**上下文控制室** · [源码](demo/readme-showcase/07-context-control-room.md)

[![灵感信号播放器](public/showcase/08-idea-signal-player.png)](demo/readme-showcase/08-idea-signal-player.md)

**灵感信号播放器** · [源码](demo/readme-showcase/08-idea-signal-player.md)

[![口袋 Blackboard](public/showcase/09-pocket-blackboard.png)](demo/readme-showcase/09-pocket-blackboard.md)

**口袋 Blackboard** · [源码](demo/readme-showcase/09-pocket-blackboard.md)

## 为什么文本也可以是视觉媒介

人擅长扫视二维平面，语言模型擅长生成和修改 token 序列。截图保留了布局，却引入像素噪声，也很难在多轮协作中精确修改；普通文本容易编辑，却通常失去了空间与样式。

CharDesk 同时保留两者。固定 Unicode 网格承载位置，Box Drawing 承载结构，ANSI 承载强调。作品仍然可以被选择、搜索、比较版本，并由 Agent 直接修改。

```text
   人阅读一个场景
          ⇅
   Unicode 网格 + ANSI
          ⇅
   Agent 编辑 token
```

## 表达媒介

### 视觉文本

Unicode、Box Drawing、中日韩字符、技术符号、单色 Emoji 与 Nerd Font 字形共享同一网格。ESC-less ANSI 为内容增加前景色、背景色、粗体、斜体、下划线、删除线与反色，而不必把作品变成图片。

### 结构化表达

可以编写 Markdown、Mermaid、数学公式、GFM 表格、Fenced Code、JSON、YAML、Vega-Lite，以及 XY 图或折线图。CharGraph 将结构化源码编译成可移植的字符图，同时保留生成它的源码。

### 空间组织

在自由画布中排列内容、从可复用 Cell 模板开始，用 `|||` 与 `---` 组合多行区域，把完整场景收进 Blackboard，或用 Slides 讲述故事。所有形态最终进入同一条字符网格渲染管线。

### Agent 接入

- **本地文件与 CLI：**稳定的默认路径。Agent 使用原生文件工具，`chardesk` 负责检查、预览、打开和渲染。详见 [CLI 文档](packages/cli/README.md)。
- **Chrome WebMCP：**实验性能力。开启 `chrome://flags/#enable-webmcp-testing`，重启 Chrome，并为兼容的 Agent 保持 [CharDesk](https://chardesk.com/) 页面打开。
- **ChatGPT Site Tools：**实验性能力。在 **Settings → Browser → Permissions** 中开启 **Site tools**，再用 ChatGPT 内置浏览器打开 CharDesk。参见 [OpenAI 官方 Site Tools 文档](https://learn.chatgpt.com/docs/webmcp)。

浏览器 Agent 可以调用 `chardesk_read_materials`，进入与 skill 相同的视觉语言和案例环境。Blackboard 工具默认操作当前页面可见的画布；创建或打开工作区时会自动激活它。

## 面向开发者

使用 [`@chardesk/protocol`](packages/protocol/README.md) 完成格式交换，使用 [`@chardesk/viewer`](packages/viewer/README.md) 完成框架无关的渲染，使用 [`@chardesk/fonts`](packages/fonts/README.md) 获得兼容字形集。安装与 API 说明由各个包的文档负责。

## 致谢

感谢 [LINUX DO](https://linux.do/) 社区。

## 许可证

CharDesk 基于 [MIT License](LICENSE) 开源。
