# CharDesk Cell UI Portal

Public [Gallery](https://ui.chardesk.com/) and executable Playground for Cell UI. [Source installation](../../packages/cell-ui/README.md#source-installation) is owned by the package README.

```sh
npm run dev:cell-ui
npm run build -w @chardesk/cell-ui-site
npm run test:cell-ui-site
npm run test:e2e -w @chardesk/cell-ui-site
```

The local portal opens at `http://localhost:5190/#/components/button`. Component documentation lives in [`src/component-catalog.tsx`](src/component-catalog.tsx); `#/__fixtures/all` is a non-navigation test harness. Architecture contracts live in [Development / Cell UI](../docs/content/docs/development/cell-ui/overview.mdx).
