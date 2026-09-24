# @chardesk/cell-ui

Editable React Cell UI source. Its root entry is headless; `/browser` projects the committed frame to Canvas2D and Semantic DOM. The registry installs the whole library into your project, where you can edit it.

- [Introduction](https://ui.chardesk.com/#/guides/introduction)
- [Installation](https://ui.chardesk.com/#/guides/installation)
- [Integration](https://ui.chardesk.com/#/guides/integration)
- [Theming](https://ui.chardesk.com/#/guides/theming)
- [Testing](https://ui.chardesk.com/#/guides/testing)
- [Components](https://ui.chardesk.com/#/components/button)
- [Agent-readable index](https://ui.chardesk.com/llms.txt)

Install from a React project with `components.json` and a `lib` alias:

```sh
npx shadcn@latest add Sayhi-bzb/CharDesk/cell-ui
```

The [published registry item](https://sayhi-bzb.github.io/CharDesk/cell-ui.json) owns the editable file and dependency list. [Development architecture](../../apps/docs/content/docs/development/cell-ui/overview.mdx), [widget behavior](../../apps/docs/content/docs/development/cell-ui/widgets.mdx), [interaction foundation](../../apps/docs/content/docs/development/cell-ui/primitives.mdx), and [composition](../../apps/docs/content/docs/development/cell-ui/compositor.mdx) own internal contracts.

## Alert (uncommitted work in progress)

`Alert` composes one direct, non-empty `AlertTitle`, optional `AlertDescription`, and optional `Button` in that order. It remains inline and persistent; only the Button accepts commands. `tone` uses the existing info/success/warning/error theme colors and Unicode marks. `border` accepts `none`, `square`, or `rounded`; the default is `none`. Info/success use status semantics, while warning/error use alert semantics. Its description/action row uses `CellLayoutStyle.wrap` so the action moves to the next line when needed. [Gallery usage](../../apps/cell-ui/src/component-catalog.tsx) · [Behavior contract](../../apps/docs/content/docs/development/cell-ui/widgets.mdx).
