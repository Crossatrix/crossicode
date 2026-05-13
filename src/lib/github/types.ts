export interface GitHubRepo {
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface GitHubRepoListItem {
  full_name: string;
  default_branch: string;
  private: boolean;
  description: string | null;
}

export interface BranchInfo {
  name: string;
  commit: { sha: string };
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
}

export interface ConflictFile {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  merged: string; // diff3 merged with markers (text only); for binary: "ours"
  hasMarkers: boolean;
  binary?: boolean; // when true, no text-merge possible — pick ours or theirs
}

export interface PullResult {
  upToDate: boolean;
  newCommitSha: string;
  cleanUpdates: Record<string, string | null>; // null = deleted
  conflicts: ConflictFile[];
}
