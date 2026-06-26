import { useState, useEffect } from "react";
import { X, Download, Upload, RefreshCw, GitBranch, GitPullRequest, Plus, Loader2, AlertTriangle, Check, ExternalLink } from "lucide-react";
import { useGitHubStore } from "../hooks/use-github-store";
import { gh, parseRepoInput, GitHubError } from "../lib/github/client";
import { listMyRepos, listBranches, cloneRepo, getBranchHead, getRepoMeta } from "../lib/github/repo";
import { commitAndPush, diffFiles } from "../lib/github/commit";
import { pullFromRemote } from "../lib/github/pull";
import { createBranch, createPullRequest } from "../lib/github/pr";
import { listAppInstallations } from "../lib/github.functions";
import type { GitHubRepoListItem, BranchInfo, PullResult, ConflictFile } from "../lib/github/types";


interface Props {
  files: Record<string, string>;
  onClose: () => void;
  onImportFiles: (files: Record<string, string>) => void;
  onPatchFiles: (patch: Record<string, string | null>) => void; // null = delete
}

type Mode = "main" | "connect" | "clone" | "commit" | "pull" | "conflicts" | "pr" | "newbranch";

const APP_SLUG = (import.meta as any).env?.VITE_GITHUB_APP_SLUG || "";

export function GitHubPanel({ files, onClose, onImportFiles, onPatchFiles }: Props) {
  const gh_ = useGitHubStore();
  const initialMode: Mode = gh_.connection ? (gh_.repo ? "main" : "clone") : "connect";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  // app install
  const [manualInstallId, setManualInstallId] = useState("");
  const [appInstalls, setAppInstalls] = useState<Array<{ id: number; accountLogin: string; accountType: string }> | null>(null);


  // clone
  const [repoInput, setRepoInput] = useState("");
  const [myRepos, setMyRepos] = useState<GitHubRepoListItem[] | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [pendingRepo, setPendingRepo] = useState<{ owner: string; name: string; defaultBranch: string } | null>(null);

  // commit
  const [commitMessage, setCommitMessage] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // pull
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [conflictIndex, setConflictIndex] = useState(0);
  const [conflictsResolved, setConflictsResolved] = useState<Record<string, string>>({});

  // PR
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prResult, setPrResult] = useState<{ url: string; number: number } | null>(null);

  // new branch
  const [newBranchName, setNewBranchName] = useState("");

  const changes = gh_.repo ? diffFiles(files, gh_.baseFiles) : [];

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setProgress("");
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  // --- GITHUB APP INSTALL ---
  const openInstallWindow = () => {
    if (!APP_SLUG) {
      setError(
        "GitHub App slug not configured. Set VITE_GITHUB_APP_SLUG to your app's slug."
      );
      return;
    }
    const url = `https://github.com/apps/${APP_SLUG}/installations/new`;
    window.open(url, "github-install", "width=900,height=750");
  };

  const submitManualInstall = () => wrap(async () => {
    const id = Number(manualInstallId.trim());
    if (!Number.isFinite(id) || id <= 0) throw new Error("Enter a numeric installation ID");
    await gh_.connectInstallation(id);
    setMode(gh_.repo ? "main" : "clone");
  });

  const refreshAfterInstall = () => wrap(async () => {
    await gh_.refreshConnection();
    // also try to pull installation_id from URL params if present
  });

  // --- CLONE ---
  const loadMyRepos = () => wrap(async () => {
    const rs = await listMyRepos(gh_.token);
    setMyRepos(rs);
  });

  const pickRepo = (owner: string, name: string, defaultBranch: string) => wrap(async () => {
    setPendingRepo({ owner, name, defaultBranch });
    const bs = await listBranches(gh_.token, owner, name);
    setBranches(bs);
    setSelectedBranch(defaultBranch);
  });

  const submitRepoInput = () => wrap(async () => {
    const p = parseRepoInput(repoInput);
    if (!p) throw new Error("Format: owner/repo or GitHub URL");
    const meta = await getRepoMeta(gh_.token, p.owner, p.name);
    await pickRepo(p.owner, p.name, meta.default_branch);
  });

  const doClone = () => wrap(async () => {
    if (!pendingRepo || !selectedBranch) return;
    const res = await cloneRepo(gh_.token, pendingRepo.owner, pendingRepo.name, selectedBranch, setProgress);
    onImportFiles(res.files);
    gh_.setRepo(
      { owner: pendingRepo.owner, name: pendingRepo.name, defaultBranch: pendingRepo.defaultBranch },
      selectedBranch,
      res.commitSha
    );
    gh_.setBaseFiles(res.files);
    setMode("main");
    if (res.skipped.length) setError(`Cloned. Skipped ${res.skipped.length} binary/large files.`);
  });

  // --- COMMIT ---
  const openCommit = () => {
    setSelectedPaths(new Set(changes.map((c) => c.path)));
    setCommitMessage("");
    setMode("commit");
  };
  const doCommit = () => wrap(async () => {
    if (!gh_.repo || !gh_.branch || !gh_.baseCommitSha) return;
    if (!commitMessage.trim()) throw new Error("Commit message required");
    const res = await commitAndPush({
      token: gh_.token,
      owner: gh_.repo.owner,
      name: gh_.repo.name,
      branch: gh_.branch,
      baseCommitSha: gh_.baseCommitSha,
      files,
      baseFiles: gh_.baseFiles,
      message: commitMessage,
      selectedPaths: Array.from(selectedPaths),
    });
    // Update base for committed paths
    const newBase = { ...gh_.baseFiles };
    for (const p of res.pushedFiles) {
      if (files[p] === undefined) delete newBase[p];
      else newBase[p] = files[p];
    }
    gh_.setBaseFiles(newBase);
    gh_.setBaseSha(res.newCommitSha);
    setMode("main");
  });

  // --- PULL ---
  const doPull = () => wrap(async () => {
    if (!gh_.repo || !gh_.branch || !gh_.baseCommitSha) return;
    const res = await pullFromRemote(
      gh_.token,
      gh_.repo.owner,
      gh_.repo.name,
      gh_.branch,
      gh_.baseCommitSha,
      gh_.baseFiles,
      files,
      setProgress
    );
    setPullResult(res);
    if (res.upToDate) {
      setMode("main");
      setError("Already up to date.");
      return;
    }
    if (res.conflicts.length === 0) {
      // Apply clean updates
      onPatchFiles(res.cleanUpdates);
      const newBase = { ...gh_.baseFiles };
      for (const [p, v] of Object.entries(res.cleanUpdates)) {
        if (v === null) delete newBase[p];
        else newBase[p] = v;
      }
      gh_.setBaseFiles(newBase);
      gh_.setBaseSha(res.newCommitSha);
      setMode("main");
    } else {
      setConflictIndex(0);
      setConflictsResolved({});
      // Pre-fill resolved with merged (with markers) so editor shows them
      const initial: Record<string, string> = {};
      for (const c of res.conflicts) initial[c.path] = c.merged;
      setConflictsResolved(initial);
      setMode("conflicts");
    }
  });

  const finishConflicts = () => wrap(async () => {
    if (!pullResult || !gh_.repo) return;
    const patch: Record<string, string | null> = { ...pullResult.cleanUpdates };
    for (const [p, v] of Object.entries(conflictsResolved)) patch[p] = v;
    onPatchFiles(patch);
    const newBase = { ...gh_.baseFiles };
    for (const [p, v] of Object.entries(pullResult.cleanUpdates)) {
      if (v === null) delete newBase[p];
      else newBase[p] = v;
    }
    // For conflicts: mark base = remote ("theirs") so a subsequent push only includes user's resolution
    for (const c of pullResult.conflicts) newBase[c.path] = c.theirs;
    gh_.setBaseFiles(newBase);
    gh_.setBaseSha(pullResult.newCommitSha);
    setMode("main");
    setPullResult(null);
  });

  // --- PR ---
  const openPR = () => {
    if (!gh_.repo || !gh_.branch) return;
    setPrTitle(commitMessage || `Update from ${gh_.branch}`);
    setPrBody("");
    setPrBase(gh_.repo.defaultBranch);
    setPrResult(null);
    setMode("pr");
  };
  const doPR = () => wrap(async () => {
    if (!gh_.repo || !gh_.branch) return;
    const res = await createPullRequest(gh_.token, gh_.repo.owner, gh_.repo.name, {
      title: prTitle,
      body: prBody,
      head: gh_.branch,
      base: prBase,
    });
    setPrResult({ url: res.html_url, number: res.number });
  });

  // --- New Branch ---
  const doNewBranch = () => wrap(async () => {
    if (!gh_.repo || !gh_.baseCommitSha) return;
    if (!newBranchName.trim()) throw new Error("Name required");
    await createBranch(gh_.token, gh_.repo.owner, gh_.repo.name, newBranchName.trim(), gh_.baseCommitSha);
    gh_.setBranch(newBranchName.trim(), gh_.baseCommitSha);
    setMode("main");
  });

  // Switch branch
  const switchBranch = (b: string) => wrap(async () => {
    if (!gh_.repo) return;
    if (changes.length > 0) {
      if (!confirm(`You have ${changes.length} uncommitted change(s). Switching will discard them. Continue?`)) return;
    }
    const res = await cloneRepo(gh_.token, gh_.repo.owner, gh_.repo.name, b, setProgress);
    onImportFiles(res.files);
    gh_.setBranch(b, res.commitSha);
    gh_.setBaseFiles(res.files);
  });

  // Load branches when on main
  useEffect(() => {
    if (mode === "main" && gh_.repo && gh_.connection && branches.length === 0) {
      listBranches(gh_.token, gh_.repo.owner, gh_.repo.name).then(setBranches).catch(() => {});
    }
  }, [mode, gh_.repo, gh_.connection, branches.length]);

  // Auto-switch to main once the GitHub App becomes connected (e.g. after the
  // install popup posts back and the connection is refreshed).
  useEffect(() => {
    if (gh_.connection && mode === "connect") {
      setMode(gh_.repo ? "main" : "clone");
    }
  }, [gh_.connection, mode, gh_.repo]);

  // Listen for the install callback (postMessage from /github/callback).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "github-app-installed") {
        gh_.refreshConnection();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [gh_]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#181825] border border-[#313244] rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col text-foreground">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244]">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <h2 className="text-sm font-semibold">GitHub Sync</h2>
            {gh_.repo && (
              <span className="text-xs text-muted-foreground">
                · {gh_.repo.owner}/{gh_.repo.name} @ {gh_.branch}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent/50 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded p-2 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> <span>{error}</span>
            </div>
          )}
          {busy && (
            <div className="text-xs text-blue-300 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> {progress || "Working…"}
            </div>
          )}

          {mode === "connect" && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  Connect your account by installing the <b>Lovable Sync</b> GitHub App
                  on the repositories you want to sync.
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Click <b>Install GitHub App</b> below.</li>
                  <li>Pick the repos you want to grant access to, then confirm.</li>
                  <li>You'll be sent back here automatically.</li>
                </ol>
                <p>
                  Commits are authored as the App; no personal access token is ever
                  stored in your browser.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={openInstallWindow}
                  disabled={busy}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded flex items-center gap-1.5"
                >
                  <ExternalLink className="h-3 w-3" /> Install GitHub App
                </button>
                <button
                  onClick={refreshAfterInstall}
                  disabled={busy}
                  className="px-3 py-1.5 bg-[#313244] hover:bg-[#414155] text-xs rounded flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" /> I've installed it
                </button>
              </div>
              <details className="text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">Have an installation ID? Connect manually</summary>
                <div className="flex gap-2 mt-2">
                  <input
                    value={manualInstallId}
                    onChange={(e) => setManualInstallId(e.target.value)}
                    placeholder="e.g. 12345678"
                    className="flex-1 bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm font-mono"
                  />
                  <button
                    onClick={submitManualInstall}
                    disabled={busy}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded"
                  >
                    Connect
                  </button>
                </div>
              </details>
            </div>
          )}

          {mode === "clone" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Repository (owner/name or URL)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="octocat/hello-world"
                    className="flex-1 bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={submitRepoInput}
                    disabled={busy}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded"
                  >
                    Find
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">— or —</div>
              <button
                onClick={loadMyRepos}
                disabled={busy}
                className="text-xs text-blue-400 hover:underline"
              >
                {myRepos ? "Refresh my repos" : "Browse my repos"}
              </button>
              {myRepos && (
                <div className="max-h-48 overflow-y-auto border border-[#313244] rounded">
                  {myRepos.map((r) => (
                    <button
                      key={r.full_name}
                      onClick={() => {
                        const [o, n] = r.full_name.split("/");
                        pickRepo(o, n, r.default_branch);
                      }}
                      className="w-full text-left px-2 py-1.5 hover:bg-accent/50 text-xs border-b border-[#313244] last:border-0"
                    >
                      <div className="font-medium">{r.full_name} {r.private && <span className="text-[10px] text-muted-foreground">(private)</span>}</div>
                      {r.description && <div className="text-[10px] text-muted-foreground truncate">{r.description}</div>}
                    </button>
                  ))}
                </div>
              )}
              {pendingRepo && branches.length > 0 && (
                <div className="space-y-2 border-t border-[#313244] pt-3">
                  <div className="text-xs">
                    <b>{pendingRepo.owner}/{pendingRepo.name}</b>
                  </div>
                  <label className="text-xs text-muted-foreground">Branch</label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={doClone}
                    disabled={busy}
                    className="w-full px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded flex items-center justify-center gap-2"
                  >
                    <Download className="h-3 w-3" /> Clone into editor
                  </button>
                  <p className="text-[10px] text-amber-400">This replaces current files in the editor.</p>
                </div>
              )}
            </div>
          )}

          {mode === "main" && gh_.repo && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button onClick={doPull} disabled={busy} className="px-3 py-1.5 bg-[#313244] hover:bg-[#414155] text-xs rounded flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Pull
                </button>
                <button onClick={openCommit} disabled={busy || changes.length === 0} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded flex items-center gap-1.5">
                  <Upload className="h-3 w-3" /> Commit & Push ({changes.length})
                </button>
                <button onClick={openPR} disabled={busy} className="px-3 py-1.5 bg-[#313244] hover:bg-[#414155] text-xs rounded flex items-center gap-1.5">
                  <GitPullRequest className="h-3 w-3" /> New PR
                </button>
                <button onClick={() => setMode("newbranch")} disabled={busy} className="px-3 py-1.5 bg-[#313244] hover:bg-[#414155] text-xs rounded flex items-center gap-1.5">
                  <Plus className="h-3 w-3" /> New branch
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1"><GitBranch className="h-3 w-3" /> Switch branch</label>
                <select
                  value={gh_.branch || ""}
                  onChange={(e) => switchBranch(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <h3 className="text-xs font-semibold mb-1">Local changes ({changes.length})</h3>
                {changes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No changes since last sync.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-[#313244] rounded text-xs font-mono">
                    {changes.map((c) => (
                      <div key={c.path} className="px-2 py-1 border-b border-[#313244] last:border-0 flex items-center gap-2">
                        <span className={`w-3 ${c.status === "added" ? "text-green-400" : c.status === "deleted" ? "text-red-400" : "text-amber-400"}`}>
                          {c.status === "added" ? "+" : c.status === "deleted" ? "−" : "M"}
                        </span>
                        <span className="truncate">{c.path}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#313244]">
                <button onClick={() => setMode("clone")} className="text-xs text-blue-400 hover:underline">Clone different repo</button>
                {gh_.connection && (
                  <span className="text-[10px] text-muted-foreground self-center">
                    GitHub App: {gh_.connection.accountLogin}
                  </span>
                )}
                <button
                  onClick={() => { gh_.disconnect(); setMode("clone"); }}
                  className="text-xs text-red-400 hover:underline ml-auto"
                >
                  Disconnect repo
                </button>
                <button
                  onClick={() => wrap(async () => { await gh_.disconnectApp(); setMode("connect"); })}
                  className="text-xs text-red-400 hover:underline"
                >
                  Disconnect GitHub App
                </button>
              </div>
            </div>
          )}

          {mode === "commit" && (
            <div className="space-y-3">
              <input
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message"
                className="w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                autoFocus
              />
              <div className="max-h-64 overflow-y-auto border border-[#313244] rounded">
                {changes.map((c) => (
                  <label key={c.path} className="flex items-center gap-2 px-2 py-1 text-xs font-mono hover:bg-accent/50 cursor-pointer border-b border-[#313244] last:border-0">
                    <input
                      type="checkbox"
                      checked={selectedPaths.has(c.path)}
                      onChange={(e) => {
                        const next = new Set(selectedPaths);
                        if (e.target.checked) next.add(c.path); else next.delete(c.path);
                        setSelectedPaths(next);
                      }}
                    />
                    <span className={`w-3 ${c.status === "added" ? "text-green-400" : c.status === "deleted" ? "text-red-400" : "text-amber-400"}`}>
                      {c.status === "added" ? "+" : c.status === "deleted" ? "−" : "M"}
                    </span>
                    <span className="truncate">{c.path}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setMode("main")} className="px-3 py-1.5 bg-[#313244] text-xs rounded">Cancel</button>
                <button onClick={doCommit} disabled={busy || selectedPaths.size === 0} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded flex items-center gap-1.5">
                  <Upload className="h-3 w-3" /> Push {selectedPaths.size} file(s)
                </button>
              </div>
            </div>
          )}

          {mode === "conflicts" && pullResult && (
            <ConflictsView
              conflicts={pullResult.conflicts}
              resolved={conflictsResolved}
              setResolved={setConflictsResolved}
              index={conflictIndex}
              setIndex={setConflictIndex}
              onCancel={() => { setMode("main"); setPullResult(null); }}
              onFinish={finishConflicts}
              busy={busy}
              cleanCount={Object.keys(pullResult.cleanUpdates).length}
            />
          )}

          {mode === "pr" && (
            <div className="space-y-3">
              {prResult ? (
                <div className="space-y-2">
                  <div className="text-sm flex items-center gap-2 text-green-400">
                    <Check className="h-4 w-4" /> Pull request #{prResult.number} created
                  </div>
                  <a href={prResult.url} target="_blank" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                    Open on GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                  <button onClick={() => setMode("main")} className="px-3 py-1.5 bg-[#313244] text-xs rounded">Done</button>
                </div>
              ) : (
                <>
                  <input
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="PR title"
                    className="w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                    placeholder="Description (optional)"
                    rows={5}
                    className="w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                  />
                  <div className="text-xs text-muted-foreground">
                    From <b>{gh_.branch}</b> into{" "}
                    <select
                      value={prBase}
                      onChange={(e) => setPrBase(e.target.value)}
                      className="bg-[#11111b] border border-[#313244] rounded px-1 py-0.5"
                    >
                      {branches.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setMode("main")} className="px-3 py-1.5 bg-[#313244] text-xs rounded">Cancel</button>
                    <button onClick={doPR} disabled={busy || !prTitle.trim()} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded">
                      Create pull request
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {mode === "newbranch" && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">New branch name (from current commit)</label>
              <input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="feature/my-change"
                className="w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setMode("main")} className="px-3 py-1.5 bg-[#313244] text-xs rounded">Cancel</button>
                <button onClick={doNewBranch} disabled={busy || !newBranchName.trim()} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded">
                  Create & switch
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConflictsView({
  conflicts, resolved, setResolved, index, setIndex, onCancel, onFinish, busy, cleanCount
}: {
  conflicts: ConflictFile[];
  resolved: Record<string, string>;
  setResolved: (r: Record<string, string>) => void;
  index: number;
  setIndex: (i: number) => void;
  onCancel: () => void;
  onFinish: () => void;
  busy: boolean;
  cleanCount: number;
}) {
  const c = conflicts[index];
  const update = (v: string) => setResolved({ ...resolved, [c.path]: v });
  const isBinary = !!c.binary;
  const allResolved = conflicts.every((cf) =>
    cf.binary ? resolved[cf.path] !== undefined : !resolved[cf.path]?.includes("<<<<<<<")
  );
  return (
    <div className="space-y-2">
      <div className="text-xs text-amber-400">
        {conflicts.length} conflict(s). {cleanCount} clean update(s) will also apply.
        {!isBinary && <> Remove all <code>{"<<<<<<<"}</code> markers to finish.</>}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button disabled={index === 0} onClick={() => setIndex(index - 1)} className="px-2 py-1 bg-[#313244] rounded disabled:opacity-30">‹</button>
        <span>{index + 1} / {conflicts.length}</span>
        <button disabled={index === conflicts.length - 1} onClick={() => setIndex(index + 1)} className="px-2 py-1 bg-[#313244] rounded disabled:opacity-30">›</button>
        <span className="font-mono truncate">{c.path}</span>
        {isBinary && <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">binary</span>}
      </div>
      <div className="flex gap-1">
        <button onClick={() => update(c.ours)} className="px-2 py-1 text-[10px] bg-[#313244] rounded">Keep mine</button>
        <button onClick={() => update(c.theirs)} className="px-2 py-1 text-[10px] bg-[#313244] rounded">Take theirs</button>
        {!isBinary && (
          <button onClick={() => update(c.merged)} className="px-2 py-1 text-[10px] bg-[#313244] rounded">Reset to merged</button>
        )}
      </div>
      {isBinary ? (
        <div className="text-xs text-muted-foreground bg-[#11111b] border border-[#313244] rounded p-3">
          Binary file — choose which version to keep.
          {resolved[c.path] !== undefined && (
            <div className="mt-2 text-green-400">
              ✓ {resolved[c.path] === c.ours ? "Keeping yours" : "Taking theirs"}
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={resolved[c.path] ?? c.merged}
          onChange={(e) => update(e.target.value)}
          rows={14}
          className="w-full bg-[#11111b] border border-[#313244] rounded px-2 py-1.5 text-xs font-mono"
        />
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 bg-[#313244] text-xs rounded">Cancel pull</button>
        <button
          onClick={onFinish}
          disabled={busy || !allResolved}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs rounded"
        >
          {allResolved ? "Apply resolutions" : "Resolve all conflicts first"}
        </button>
      </div>
    </div>
  );
}
