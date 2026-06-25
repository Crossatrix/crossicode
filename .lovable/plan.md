## Real 2-way GitHub Sync via GitHub App

Replace the Personal Access Token flow with a single shared "Lovable Sync" GitHub App that users install on their repos. The browser never sees a private key — a server function mints short-lived installation access tokens on demand.

### What the user experiences

- "Connect GitHub" button → opens `github.com/apps/lovable-sync/installations/new` in a new tab
- They pick which repos to grant access to, GitHub redirects back to `/github/callback?installation_id=...`
- Callback saves the `installation_id` to their account row in the DB
- Repo picker now lists only repos the App can see for that installation
- Clone / commit / pull / branch / PR flows work exactly like today, but every GitHub API call goes through `ghCall()` server function that injects a fresh installation token
- Commits are authored as the **Lovable Sync App** (per your choice). PRs are opened by the app.
- Optional background poll every 30s (toggle in UI) calls `getBranchHead` to show "behind by N" badge; manual Pull still does the work.

### One-time setup (you do this, once)

1. Register a GitHub App at `github.com/settings/apps/new`:
   - Name: `Lovable Sync` (or whatever)
   - Homepage URL: your published URL
   - Callback URL: `https://<published>/github/callback`
   - Webhook: **disabled** (no realtime per your choice)
   - Permissions: `Contents: Read & Write`, `Pull requests: Read & Write`, `Metadata: Read`
   - Where can this be installed: Any account
2. After creation, GitHub gives you: **App ID**, **Client ID**, and a downloadable **private key** (`.pem`)
3. Lovable stores three secrets: `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM contents)

The plan will prompt for these via `add_secret` at the right moment.

### Architecture

```text
DB:
  github_installations            -- one row per user
    user_id (FK auth.users, PK)
    installation_id (bigint)
    account_login (text)          -- "octocat" or "my-org"
    installed_at, updated_at

Server (TanStack server functions, all .middleware([requireSupabaseAuth])):
  src/lib/github-app/jwt.server.ts        -- sign App JWT (RS256) with private key
  src/lib/github-app/token.server.ts      -- mint + cache installation tokens (10min TTL, in-memory per worker)
  src/lib/github-app/installation.server.ts -- list repos for installation
  src/lib/github.functions.ts             -- single ghCall({path, method, body}) server fn
                                             — looks up user's installation_id,
                                               mints token, proxies the request,
                                               returns {status, body}
  src/lib/github-app/callback.functions.ts -- saveInstallation({installation_id})

Routes:
  src/routes/github.callback.tsx          -- reads ?installation_id&setup_action
                                             calls saveInstallation, redirects to /

Client:
  src/lib/github/client.ts                -- REPLACE direct fetch with ghCall server fn
                                             same signature so repo/commit/pull/pr modules
                                             stay nearly untouched
  src/hooks/use-github-store.ts           -- drop `token`, add `installationId`, `accountLogin`
  src/components/GitHubPanel.tsx          -- replace TokenSetup with "Install App" button
                                             + "Manage installation" link
                                             + (optional) "Auto-check for updates" toggle
```

### Server-side token flow

1. App JWT: sign `{iat, exp: iat+540, iss: GITHUB_APP_ID}` with RS256 using `GITHUB_APP_PRIVATE_KEY`. Use Web Crypto (`crypto.subtle.importKey` + `sign`) — works in the Worker runtime, no Node-only crypto.
2. `POST /app/installations/{installation_id}/access_tokens` with `Authorization: Bearer <app_jwt>` → returns `{token, expires_at}`
3. Cache `{token, expires_at}` per `installation_id` in a module-scope `Map` until 60s before expiry
4. `ghCall` uses that token as `Authorization: Bearer <inst_token>`

### Client refactor (minimal)

Today `src/lib/github/client.ts::gh()` does `fetch("https://api.github.com" + path, {Authorization: Bearer ${token}})`. Change it to:

```ts
export async function gh<T>(_unused: string, path: string, init?: RequestInit): Promise<T> {
  const res = await ghCall({ data: { path, method: init?.method ?? "GET", body: init?.body as string | undefined } });
  if (res.status >= 400) throw new GitHubError(res.status, res.message);
  return res.body as T;
}
```

The first parameter (token) becomes unused — kept so `repo.ts`, `commit.ts`, `pull.ts`, `pr.ts` don't change. Later we can drop it.

`useGitHubStore` drops `token`, gains `installationId` + `accountLogin`. `disconnect()` clears the DB row via a `removeInstallation` server fn (and tells the user to uninstall via GitHub for full revocation).

### Install / callback flow

- "Connect" button: `window.open(\`https://github.com/apps/${SLUG}/installations/new?state=${csrf}\`, "_blank")`
- App redirects browser to `https://<site>/github/callback?installation_id=123&setup_action=install&state=<csrf>`
- Route component validates state, calls `saveInstallation({installation_id})`, then `navigate({to:"/"})`
- App slug is public; expose via `import.meta.env.VITE_GITHUB_APP_SLUG` (read from a non-secret env var, or hardcoded).

### Polling (optional, off by default)

- `useEffect` in `GitHubPanel`: every 30s while connected + tab visible → call `getBranchHead`, compare to `baseCommitSha`, update "behind by N" badge. No auto-pull.

### Edge cases

- User installs App on a different account than the one repo-picker shows → list installations: `GET /user/installations` won't work (that's user-to-server). Instead list repos via `GET /installation/repositories` with the installation token; show `account_login` so user knows whose repos these are. Support multiple installations later (v2).
- Token expired mid-request → cache miss → mint new one transparently.
- Non-fast-forward push → same UX as today ("Remote has new commits. Pull first.").
- Uninstalled on GitHub → next call 404s → UI says "App was uninstalled. Reconnect."

### Migration from PAT

On first load after this ships: if `localStorage["gh-token"]` exists but no installation row → show banner "GitHub PAT mode is deprecated, install the Lovable Sync App". Keep PAT code path behind a feature flag for one release, then delete.

### Out of scope (v1)

- Webhooks / realtime push (you said no)
- User-to-server OAuth (commits will be authored as the App, not the human)
- Multiple installations per user
- GitHub Enterprise Server (api.github.com only)

### Build order

1. Add `github_installations` table + RLS + GRANTs (migration)
2. Request secrets: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, plus public `VITE_GITHUB_APP_SLUG` in `.env`
3. Server-side JWT signer + token cache + `ghCall` server fn
4. `/github/callback` route + `saveInstallation` server fn
5. Refactor `src/lib/github/client.ts` to proxy through `ghCall`; drop `token` from store
6. Rewrite `GitHubPanel` setup screen (Install button + installation status); keep sync/conflict/PR UI as-is
7. Optional polling toggle
8. Remove PAT code path
