# Public site deployment

`npm run build` assembles the public site in `apps/site/dist/` from the site entrance, Canvas assets, docs, CharGraph, and the old-origin migration bridge. Canvas builds separately in `apps/canvas/dist/`. The HTML entrance retains plain links when its module cannot load.

Deploy the two Cloudflare Pages projects with these settings:

| Domain | Project root | Build command | Output directory |
| --- | --- | --- | --- |
| `chardesk.com` | `apps/site` | `npm --prefix ../.. run build` | `dist` |
| `canvas.chardesk.com` | `apps/canvas` | `npm --prefix ../.. run build:app` | `dist` |

Keep `ui.chardesk.com` on its existing project. Add the Canvas custom domain in Pages before changing the root deployment. Do not publish the new Canvas origin without `/migration/bridge.html` on the root origin: first-load local workspace transfer depends on both.

The root origin retains `/blackboard`, `/s/*`, and root-level collaboration links long enough to route old shares to Canvas. Do not remove the bridge while old browser-local work may still exist.

`/legacy/` is a noindex recovery copy of Canvas on the old origin. It remains available when a browser blocks transfer or the new origin already contains work; it is not a product entry point.
