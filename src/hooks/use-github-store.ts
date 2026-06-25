import { useCallback, useEffect, useState } from "react";
import type { GitHubRepo } from "../lib/github/types";
import {
  getMyInstallation,
  removeInstallation,
  saveInstallation,
} from "../lib/github.functions";

const STATE_KEY = "gh-state";
const BASE_FILES_KEY = "gh-base-files";

export interface GitHubPersistedState {
  repo: GitHubRepo | null;
  branch: string | null;
  baseCommitSha: string | null;
}

export interface GitHubConnection {
  installationId: number;
  accountLogin: string;
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
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [connectionLoaded, setConnectionLoaded] = useState(false);
  const [state, setState] = useState<GitHubPersistedState>(loadState);
  const [baseFiles, setBaseFilesState] = useState<Record<string, string>>(loadBaseFiles);

  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const refreshConnection = useCallback(async () => {
    try {
      const res = await getMyInstallation();
      setConnection(res);
    } catch {
      setConnection(null);
    } finally {
      setConnectionLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshConnection();
  }, [refreshConnection]);

  const connectInstallation = useCallback(async (installationId: number) => {
    const res = await saveInstallation({ data: { installationId } });
    setConnection({ installationId: res.installationId, accountLogin: res.accountLogin });
    return res;
  }, []);

  const setRepo = useCallback(
    (repo: GitHubRepo | null, branch: string | null, sha: string | null) => {
      setState({ repo, branch, baseCommitSha: sha });
    },
    []
  );

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
    } catch {
      try {
        localStorage.removeItem(BASE_FILES_KEY);
      } catch {}
    }
  }, []);

  const disconnectRepo = useCallback(() => {
    setState({ repo: null, branch: null, baseCommitSha: null });
    setBaseFilesState({});
    try {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(BASE_FILES_KEY);
    } catch {}
  }, []);

  const disconnectApp = useCallback(async () => {
    try {
      await removeInstallation();
    } catch {}
    setConnection(null);
    disconnectRepo();
  }, [disconnectRepo]);

  return {
    // App connection
    connection,
    connectionLoaded,
    refreshConnection,
    connectInstallation,
    disconnectApp,
    // Back-compat: many existing helpers expect `.token`. With the GitHub App
    // proxy, no token is ever needed on the client; pass through an empty string.
    token: "",
    // Repo state
    repo: state.repo,
    branch: state.branch,
    baseCommitSha: state.baseCommitSha,
    baseFiles,
    setRepo,
    setBranch,
    setBaseSha,
    setBaseFiles,
    disconnect: disconnectRepo,
  };
}
