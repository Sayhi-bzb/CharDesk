# Public site deployment

`npm run build` assembles the public site in `apps/site/dist/` from the site entrance, Canvas assets, docs, CharGraph, and the old-origin migration bridge. Canvas builds separately in `apps/canvas/dist/`. The HTML entrance retains plain links when its module cannot load.

The Cloudflare Pages projects use these build contracts:

| Project / domain | Build source | Build command | Output directory |
| --- | --- | --- | --- |
| `ascii-canvas` / `chardesk.com` | Git, repository root | `npm run build` | `apps/site/dist` |
| `chardesk-canvas` / `canvas.chardesk.com` | Direct upload, repository root | `npm run build:app` | `apps/canvas/dist` |

Keep `ui.chardesk.com` on its existing project. The root deployment must retain `/migration/bridge.html`; first-load local workspace transfer depends on both origins.

The root origin retains `/blackboard`, `/s/*`, and root-level collaboration links long enough to route old shares to Canvas. Do not remove the bridge while old browser-local work may still exist.

`/legacy/` is a noindex recovery copy of Canvas on the old origin. It remains available when a browser blocks transfer or the new origin already contains work; it is not a product entry point.
