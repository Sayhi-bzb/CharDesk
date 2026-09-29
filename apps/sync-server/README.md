# Sync and account service

The existing `/v1/rooms/:id` relay holds encrypted collaboration frames only in
memory. The optional account API owns a SQLite catalog and explicit Canvas/Slides
snapshots or Blackboard source-tree backups on a persistent volume. Collaboration rooms are not backed up.

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` together to enable the account
API. Register `https://sync.chardesk.com/v1/account/callback` as the GitHub OAuth
App callback. `ACCOUNT_PUBLIC_ORIGIN` is the API origin; `ACCOUNT_APP_ORIGIN`
defaults to `https://canvas.chardesk.com` and must appear in
`ALLOWED_ORIGINS`. `ACCOUNT_DATABASE` points to the SQLite file. The deployment
compose mounts the `accounts` volume at `/data`; back it up with SQLite's online
backup mechanism or while the service is stopped before replacing the host.

Build Canvas with `VITE_ACCOUNT_API_ENDPOINT=https://sync.chardesk.com` only
after the account API is deployed. Local development can use
`http://127.0.0.1:1234` for the API endpoint and
`http://127.0.0.1:5173` for `ACCOUNT_APP_ORIGIN`; configure a separate GitHub
OAuth App with callback `http://127.0.0.1:1234/v1/account/callback`.
The server's `dev` script loads its ignored `.env.local`; Canvas uses Vite's
ignored `.env.local`. Copy the corresponding `.env.example` files, set the
local GitHub Client ID and Secret only in `apps/sync-server/.env.local`, and
restart both development servers after changing them. The local account
database is ignored at `apps/sync-server/.data/accounts.sqlite`.

`POST /v1/account/works/backups` stores a `.chardesk` snapshot atomically with
its private catalog entry; `GET /v1/account/works/:id/content` restores it.
`PUT /v1/account/works/:id/content` replaces that snapshot only when
`expectedRevision` matches; a stale writer receives `409` without changing content.
Uploaded work titles change through that versioned update, not the catalog-only
rename endpoint.
Limits are 10 MiB per backup and 100 MiB per account. Existing catalog-only
entries retain `contentStatus: "not-uploaded"`. The local `/workspace` list
uploads only after a user first backs up or restores a local Canvas/Slides work.
That work then syncs in the background; later manual backups create independent
recovery copies. Concurrent remote edits fork a conflict copy rather than overwrite
either version. This is not real-time collaboration or end-to-end encryption;
the service can read stored snapshots.
The work catalog carries `revision` and `conflictWith` so another device can
discover both versions without downloading all content. A device downloads a
cloud work when opened and applies newer revisions to a bound local session or
Blackboard source tree only if it has no unacknowledged edits.
The [state-flow authority](../docs/content/docs/development/architecture/state-flows.mdx)
owns the distinction between source, session, and collaboration data.
