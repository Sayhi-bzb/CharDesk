# Public site deployment

The root app build in `dist/` is Canvas. `npm run build` compiles the Cell UI product entrance from `apps/site` and assembles it with docs, CharGraph, and the old-origin migration bridge in `dist-site/`. The HTML entrance retains plain links when its module cannot load.

Deploy `dist-site/` to `chardesk.com` with `npm run build` and `dist/` to `canvas.chardesk.com` with `npm run build:app` as separate Cloudflare Pages projects. Keep `ui.chardesk.com` on its existing project. Add the Canvas custom domain in Pages before changing the root deployment. Do not publish the new Canvas origin without `/migration/bridge.html` on the root origin: first-load local workspace transfer depends on both.

The root origin retains `/blackboard`, `/s/*`, and root-level collaboration links long enough to route old shares to Canvas. Do not remove the bridge while old browser-local work may still exist.

`/legacy/` is a noindex recovery copy of Canvas on the old origin. It remains available when a browser blocks transfer or the new origin already contains work; it is not a product entry point.
