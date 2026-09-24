# GitHub Star snapshot

`ui.chardesk.com` and `chardesk.com` read the same `github-stars` key from one Cloudflare KV namespace through `/api/github-stars`. The Gallery Pages project currently builds from the repository root, so `functions/api/github-stars.ts` serves it; `apps/cell-ui/functions/` supports a future Gallery root-directory switch. Bind the namespace as `GITHUB_STARS` in both Pages projects and redeploy each project. The committed `_routes.json` files limit Function invocation to this API path.

Configure the [publisher workflow](../../.github/workflows/github-stars.yml) with repository variables `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_GITHUB_STARS_KV_NAMESPACE_ID`, plus secret `CLOUDFLARE_GITHUB_STARS_API_TOKEN`. Grant the token only the account-level `Workers KV Storage Write` permission. The workflow uses its built-in `GITHUB_TOKEN` to read GitHub, runs at minute 17 each hour, and can be started with `workflow_dispatch` to seed the key before deployment.

The snapshot is `{ "count": number, "updatedAt": ISO-8601 string }`. Failed updates leave the last successful value in place; without a valid value the Pages Function returns 503 and clients omit the number.
