# CharDesk documentation delivery

`docs.chardesk.com` is the human product manual. `content/manual` owns its prose;
`navigation.json` owns grouping and search aliases. English is the default language;
Chinese search aliases remain available. Page titles, sections, search,
HTML, Cell view, and text exports derive from that same source. Cell UI consumption
belongs to `ui.chardesk.com`.

The workspace has two build targets:

| Target | Source | Artifact | Publication |
| --- | --- | --- | --- |
| Product | `reader`, `content/manual` | `dist` | Cloudflare Pages project `chardesk-docs`, custom domain `docs.chardesk.com` |
| Engineering | `app`, `content/docs` | `engineering-build/client/docs` | Main-site compatibility resources under `/docs` |

The [root manifest](../../package.json) owns commands. Development serves the
product manual at `http://127.0.0.1:5174/`; engineering preview uses port 5175 and
`/docs/`. [Shared reading components](../../packages/docs-ui) are also consumed
by the Cell UI portal; neither app imports the other.

Engineering source paths remain stable for repository links. [Legacy routing](../../scripts/docs/legacy-routes.mjs)
maps old human pages to the product manual or their repository authority. Existing
Agent Markdown, route JSON and search endpoints remain served at their old paths.
The public manual has its own search and text exports, without engineering pages.

[The manual verifier](../../scripts/docs/verify-manual.mjs) checks source/output
parity, navigation, headings, anchors, prerendered prose, assets, metadata and
content separation. [Browser tests](e2e/manual.spec.ts) cover reading, search,
mobile navigation, appearance, the shared Cell template, and readable fallbacks. The default interface uses the same Cell-rendered header, font/theme controls,
navigation, mobile Accordion, contents, article and code blocks as the Cell UI
portal. HTML is a same-source fallback for no-script, printing, browser Find
and loading failures; it is not a separate default interface.
Shared links use a [host navigation adapter](../../packages/docs-ui/src/links.tsx).
The manual routes internal links through React Router, keeping Cell UI active
between pages; prerendered data follows the same trailing-slash URLs as navigation.

## Deployment

Create `chardesk-docs` as a Direct Upload Pages project with production branch
`main`; attach `docs.chardesk.com` through Pages Custom Domains. Set repository
variable `CHARDESK_DOCS_DEPLOY_ENABLED=true` only after that binding is ready.
The [Verify workflow](../../.github/workflows/ci.yml) then publishes its verified
`docs-dist` artifact using the existing Cloudflare credentials. This gate keeps
an unconfigured domain from failing unrelated releases.

For Git-integrated deployment instead, build from the repository root with
`npm run build:docs`, publish `apps/docs/dist`, and leave the direct-upload gate
disabled. Configure only one deployment owner.
