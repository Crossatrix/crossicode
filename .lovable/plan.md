## GitHub 2-Way Sync — Plan

Add full GitHub integration to the in-browser editor: clone any repo, edit, commit & push, pull updates, manage branches, open PRs, and resolve conflicts. Auth via Personal Access Token (PAT).

### What the user gets

- **GitHub button** in the top bar opens a "GitHub" dialog
- **Token setup** — paste a PAT (with `repo` scope), stored in localStorage
- **Clone repo** — paste `owner/repo` URL or pick from "My repos" list, choose branch, loads files into editor
- **Branch bar** below top bar shows: current repo · branch dropdown · "↓ Pull" · "↑ Commit & Push" · "Open PR" · status badge ("clean" / "N changes" / "behind remote")
- **Commit dialog** — message field, list of changed files with checkboxes, push button
- **Pull / fetch** — manual button; on opening a project also auto-fetches and shows "behind by N commits" badge
- **Branch management** — switch branch (warns if dirty), create new branch from current
- **Pull Request** — title + body + base branch; opens PR via API, shows link
- **Conflict resolution UI** — when remote file differs from local base, show 3-pane (base / yours / theirs) with "keep mine", "take theirs", or manual merge in editor

### Architecture

```text
src/lib/github/
  client.ts          # fetch wrapper for api.github.com with PAT
  repo.ts            # clone, listBranches, listRepos, getTree, getBlob
  commit.ts          # createCommit (tree + commit + update ref)
  pull.ts            # fetch latest, diff against local base
  pr.ts              # createPullRequest, listPullRequests
  merge.ts           # 3-way diff helpers (use 'diff3' lib)
  types.ts           # GitHubRepo, Branch, CommitInfo, FileChange, Conflict

src/components/github/
  GitHubDialog.tsx          # main hub: token, repo picker, clone
  GitHubBranchBar.tsx       # always-visible status bar when repo connected
  CommitDialog.tsx          # stage + message + push
  PullResultDialog.tsx      # shows incoming changes / conflicts
  ConflictResolver.tsx      # per-file 3-pane resolver
  CreatePRDialog.tsx        # PR title/body/base
  TokenSetup.tsx            # PAT input + scope guide + test connection

src/hooks/
  use-github-store.ts       # repo, branch, baseSha, baseFiles (snapshot at clone/pull), token
```

### Data model (added to editor store + localStorage)

```ts
interface GitHubState {
  token: string;
  repo: { owner: string; name: string; defaultBranch: string } | null;
  branch: string | null;
  baseCommitSha: string | null;        // last sync point
  baseFiles: Record<string,string>;    // file snapshots at baseCommitSha — for diff & conflict detection
}
```

Diff = compare current `files` vs `baseFiles`. Push creates a commit on top of `baseCommitSha`; if remote head moved, surface as "behind — pull first".

### How sync works (no real git, pure REST API)

- **Clone**: `GET /repos/{o}/{r}/git/trees/{branch}?recursive=1` → fetch each blob via `GET /git/blobs/{sha}` (base64 decode). Save to editor + `baseFiles`.
- **Push**: 
  1. For each changed file: `POST /git/blobs` → get sha
  2. `POST /git/trees` with base_tree = current head tree, modifications + deletions
  3. `POST /git/commits` with parents = [head sha], message
  4. `PATCH /git/refs/heads/{branch}` to new commit sha (fails if remote moved → trigger pull-first flow)
- **Pull**: Fetch remote head; for each file changed remotely:
  - Not changed locally → take remote
  - Changed locally + same content → no-op
  - Changed locally + different → **conflict**, queue for `ConflictResolver`
- **Branches**: `GET /repos/.../branches`, `POST /git/refs` to create
- **PRs**: `POST /repos/.../pulls` with title, body, head, base

### Conflict resolution

Use the `diff3` npm package (tiny, browser-safe, pure JS) to produce a merged file with `<<<<<<<` markers when auto-merge fails. UI shows per-file: "Keep mine", "Take theirs", or "Edit manually" (opens in editor with markers; user removes markers and clicks resolved).

### Security notes

- PAT is sensitive but stays in user's browser (localStorage) — same model as the existing OpenRouter API key. Add a clear warning + "use fine-grained PAT scoped to one repo" guidance in `TokenSetup`.
- All GitHub calls are direct from browser → `api.github.com` (CORS-allowed). No backend needed.
- Optional later: store encrypted token in cloud `projects` row for cross-device.

### Dependencies to add

- `diff3` (~3KB) for 3-way merge
- `@octokit/rest` is tempting but adds 80KB; prefer plain `fetch` wrappers for size

### Out of scope (v1)

- Submodules, LFS, large binary files (>1MB skipped with warning)
- Force push, rebase, cherry-pick
- Webhook-based realtime updates (no backend)
- OAuth login (PAT only, per your choice)

### Build order

1. Token setup + GitHub API client + repo listing
2. Clone repo into editor + branch bar UI
3. Commit & push (manual button)
4. Pull + change detection
5. Conflict resolver
6. Branch switching & creation
7. Pull request creation
