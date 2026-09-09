[English] | [简体中文](./README.zh-CN.md)

# CharDesk

> **A shared visual medium for humans and language models.**

CharDesk turns Unicode text into a shared workspace: a canvas for people, editable tokens for agents.

[Open CharDesk](https://chardesk.com/) · [Explore CharGraph](https://chardesk.com/chargraph/) · [CLI reference](packages/cli/README.md)

## Start with your agent

Requires Node.js 20 or later.

```sh
npx skills add https://github.com/sayhi-bzb/chardesk --skill chardesk
npm install -g @chardesk/cli
```

Then tell your agent what you want to see:

```text
$chardesk Explain how a GPU works as a visual blackboard.
```

The agent creates the source, checks it, and opens the canvas. You do not need to learn a file format or configure an AI provider first.

## What you can make

- Explain a concept as a spatial story instead of a wall of text.
- Present an idea as character-based slides.
- Build scientific figures with plots, formulas, data, and annotations.
- Sketch interfaces, terminals, dashboards, and product states.
- Map architectures, workflows, timelines, and relationships.
- Keep a Blackboard that people and agents can inspect and revise together.

[![CharDesk as a shared visual medium](public/showcase/01-shared-medium.png)](demo/readme-showcase/01-shared-medium.md)

**Shared medium** · [Source](demo/readme-showcase/01-shared-medium.md)

[![A visual explanation of how a GPU works](public/showcase/02-gpu-blackboard.zh-CN.png)](demo/readme-showcase/02-gpu-blackboard.zh-CN.md)

**Visual explanation** · [Source](demo/readme-showcase/02-gpu-blackboard.zh-CN.md)

[![An El Niño scientific figure](public/showcase/03-el-nino-observatory.png)](demo/readme-showcase/03-el-nino-observatory.md)

**Scientific figure** · [Source](demo/readme-showcase/03-el-nino-observatory.md)

[![A character-based slide story](public/showcase/04-story-slides.ja.png)](demo/readme-showcase/04-story-slides.ja.md)

**Character slides** · [Source](demo/readme-showcase/04-story-slides.ja.md)

[![An ANSI and Nerd Font product interface](public/showcase/05-interface-console.png)](demo/readme-showcase/05-interface-console.md)

**Interface design** · [Source](demo/readme-showcase/05-interface-console.md)

[![A shared human and agent Blackboard](public/showcase/06-agent-blackboard.png)](demo/readme-showcase/06-agent-blackboard.md)

**Agent Blackboard** · [Source](demo/readme-showcase/06-agent-blackboard.md)

### ANSI interface studies

[![A context control room](public/showcase/07-context-control-room.png)](demo/readme-showcase/07-context-control-room.md)

**Context Control Room** · [Source](demo/readme-showcase/07-context-control-room.md)

[![An idea signal player](public/showcase/08-idea-signal-player.png)](demo/readme-showcase/08-idea-signal-player.md)

**Idea Signal Player** · [Source](demo/readme-showcase/08-idea-signal-player.md)

[![A pocket Blackboard](public/showcase/09-pocket-blackboard.png)](demo/readme-showcase/09-pocket-blackboard.md)

**Pocket Blackboard** · [Source](demo/readme-showcase/09-pocket-blackboard.md)

## Why text can be visual

People scan a two-dimensional surface. Language models generate and edit token sequences. Screenshots preserve layout, but add pixel noise and are awkward to revise precisely across turns; plain text is easy to edit, but normally gives up space and style.

CharDesk keeps both. A fixed Unicode grid carries position, box drawing carries structure, and ANSI carries emphasis. The result remains selectable, searchable, diffable, and directly editable by an agent.

```text
   Human reads a scene
           ⇅
   Unicode grid + ANSI
           ⇅
   Agent edits tokens
```

## The medium

### Visual text

Unicode, box drawing, CJK, technical symbols, monochrome emoji, and Nerd Font glyphs share one grid. ESC-less ANSI adds foreground and background colors, bold, italic, underline, strike, and inverse styles without turning the work into an image.

### Structured expression

Write Markdown, Mermaid, math, GFM tables, fenced code, JSON, YAML, Vega-Lite, and XY or line charts. CharGraph compiles structured source into portable character graphics while preserving the source that produced it.

### Spatial composition

Arrange content on Freeform canvases, start from reusable Cell templates, compose multiline fields with `|||` and `---`, collect complete scenes in a Blackboard, or tell a story with Slides. Every form resolves to the same character-grid rendering pipeline.

### Agent access

- **Local files and CLI:** the stable default. Agents use normal file tools; `chardesk` checks, previews, opens, and renders the result. See the [CLI reference](packages/cli/README.md).
- **Chrome WebMCP:** experimental. Enable `chrome://flags/#enable-webmcp-testing`, relaunch Chrome, and keep [CharDesk](https://chardesk.com/) open for a compatible agent.
- **ChatGPT Site Tools:** experimental. Enable **Site tools** under **Settings → Browser → Permissions**, then open CharDesk in ChatGPT's built-in browser. See the [official Site Tools guide](https://learn.chatgpt.com/docs/webmcp).

Browser agents can call `chardesk_read_materials` to enter the same visual language and worked examples as the skill. Blackboard tools operate on the Canvas visible in that browser page; creating or opening a workspace activates it automatically.

## For builders

Use [`@chardesk/protocol`](packages/protocol/README.md) for interchange, [`@chardesk/viewer`](packages/viewer/README.md) for framework-independent rendering, and [`@chardesk/fonts`](packages/fonts/README.md) for the compatible glyph set. Each package owns its installation and API documentation.

## Thanks

Thanks to [LINUX DO](https://linux.do/).

## License

CharDesk is open source under the [MIT License](LICENSE).
