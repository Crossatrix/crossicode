import { useCallback, useEffect, useState } from "react";
import type { GitHubRepo } from "../lib/github/types";

const TOKEN_KEY = "gh-token";
const STATE_KEY = "gh-state";
const BASE_FILES_KEY = "gh-base-files";

export interface GitHubPersistedState {
  repo: GitHubRepo | null;
  branch: string | null;
  baseCommitSha: string | null;
}

function loadState(): GitHubPersistedState {
  if (typeof window === "undefined") return { repo: null, branch: null, baseCommitSha: null };
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { repo: null, branch: null, baseCommitSha: null };
}

function loadBaseFiles(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BASE_FILES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function useGitHubStore() {
  const [token, setTokenState] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem(TOKEN_KEY) || ""
  );
  const [state, setState] = useState<GitHubPersistedState>(loadState);
  const [baseFiles, setBaseFilesState] = useState<Record<string, string>>(loadBaseFiles);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const setToken = useCallback((t: string) => {
    setTokenState(t);
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {}
  }, []);

  const setRepo = useCallback((repo: GitHubRepo | null, branch: string | null, sha: string | null) => {
    setState({ repo, branch, baseCommitSha: sha });
  }, []);

  const setBranch = useCallback((branch: string, sha: string) => {
    setState((s) => ({ ...s, branch, baseCommitSha: sha }));
  }, []);

  const setBaseSha = useCallback((sha: string) => {
    setState((s) => ({ ...s, baseCommitSha: sha }));
  }, []);

  const setBaseFiles = useCallback((files: Record<string, string>) => {
    setBaseFilesState(files);
    try {
      localStorage.setItem(BASE_FILES_KEY, JSON.stringify(files));
    } catch (e) {
      // quota — store empty marker
      try { localStorage.removeItem(BASE_FILES_KEY); } catch {}
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ repo: null, branch: null, baseCommitSha: null });
    setBaseFilesState({});
    try {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(BASE_FILES_KEY);
    } catch {}
  }, []);

  return {
    token,
    setToken,
    repo: state.repo,
    branch: state.branch,
    baseCommitSha: state.baseCommitSha,
    baseFiles,
    setRepo,
    setBranch,
    setBaseSha,
    setBaseFiles,
    disconnect,
  };
}
