# CharDesk Cell UI Portal

Public [Gallery](https://ui.chardesk.com/) and executable Playground for Cell UI. [Installation](https://ui.chardesk.com/#/guides/installation) and component usage are owned by the Gallery; its [Markdown index](https://ui.chardesk.com/llms.txt) serves coding agents.

```sh
npm run dev:cell-ui
npm run build -w @chardesk/cell-ui-site
npm run test:cell-ui-site
npm run test:e2e -w @chardesk/cell-ui-site
```

The local portal opens at `http://localhost:5190/#/components/button`. Component documentation lives in [`src/component-catalog.tsx`](src/component-catalog.tsx); `#/__fixtures/all` is a non-navigation test harness. Architecture contracts live in [Development / Cell UI](../docs/content/docs/development/cell-ui/overview.mdx).

The `chardesk-cell-ui` Pages project uses `apps/cell-ui` as its root and `dist` as its output. Its build command is `cd ../.. && npm ci && npm run build -w @chardesk/cell-ui-site`. Set `SKIP_DEPENDENCY_INSTALL=1` in Production and Preview so installation uses the root workspace lockfile. Both environments bind KV as `GITHUB_STARS`; `functions/api/github-stars.ts` serves `/api/github-stars`.
