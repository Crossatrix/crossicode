import { gh, b64decode } from "./client";
import type { BranchInfo, GitHubRepoListItem } from "./types";
import { encodeBinary, isBinaryPath } from "./binary";

// Hard upper bound for files we sync. GitHub Contents API supports blobs up to
// ~100MB, but we cap lower to keep localStorage usable.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function listMyRepos(token: string): Promise<GitHubRepoListItem[]> {
  const data = await gh<any[]>(token, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator");
  return data.map((r) => ({
    full_name: r.full_name,
    default_branch: r.default_branch,
    private: r.private,
    description: r.description,
  }));
}

export async function getRepoMeta(token: string, owner: string, name: string) {
  return gh<{ default_branch: string; private: boolean }>(token, `/repos/${owner}/${name}`);
}

export async function listBranches(token: string, owner: string, name: string): Promise<BranchInfo[]> {
  return gh<BranchInfo[]>(token, `/repos/${owner}/${name}/branches?per_page=100`);
}

export async function getBranchHead(token: string, owner: string, name: string, branch: string) {
  const ref = await gh<{ object: { sha: string } }>(
    token,
    `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  return ref.object.sha;
}

export async function getCommit(token: string, owner: string, name: string, sha: string) {
  return gh<{ sha: string; tree: { sha: string }; parents: { sha: string }[] }>(
    token,
    `/repos/${owner}/${name}/git/commits/${sha}`
  );
}

export async function getTreeRecursive(
  token: string,
  owner: string,
  name: string,
  treeSha: string
) {
  return gh<{
    sha: string;
    tree: Array<{ path: string; mode: string; type: string; sha: string; size?: number }>;
    truncated: boolean;
  }>(token, `/repos/${owner}/${name}/git/trees/${treeSha}?recursive=1`);
}

export async function getBlobText(token: string, owner: string, name: string, sha: string) {
  const data = await gh<{ content: string; encoding: string; size: number }>(
    token,
    `/repos/${owner}/${name}/git/blobs/${sha}`
  );
  if (data.encoding === "base64") return b64decode(data.content);
  return data.content;
}

// Returns raw base64 for a blob (no decoding). Used for binary files.
export async function getBlobBase64(token: string, owner: string, name: string, sha: string) {
  const data = await gh<{ content: string; encoding: string; size: number }>(
    token,
    `/repos/${owner}/${name}/git/blobs/${sha}`
  );
  if (data.encoding === "base64") return data.content.replace(/\s/g, "");
  const bytes = new TextEncoder().encode(data.content);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface CloneResult {
  files: Record<string, string>;
  commitSha: string;
  treeSha: string;
  skipped: string[];
}

export async function cloneRepo(
  token: string,
  owner: string,
  name: string,
  branch: string,
  onProgress?: (msg: string) => void
): Promise<CloneResult> {
  onProgress?.("Resolving branch…");
  const commitSha = await getBranchHead(token, owner, name, branch);
  const commit = await getCommit(token, owner, name, commitSha);
  onProgress?.("Fetching tree…");
  const tree = await getTreeRecursive(token, owner, name, commit.tree.sha);
  if (tree.truncated) onProgress?.("Warning: tree truncated (very large repo).");

  const blobs = tree.tree.filter((e) => e.type === "blob");
  const files: Record<string, string> = {};
  const skipped: string[] = [];

  let done = 0;
  const queue = [...blobs];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const e = queue.shift();
      if (!e) break;
      done++;
      if (done % 10 === 0) onProgress?.(`Downloading ${done}/${blobs.length}…`);
      if ((e.size ?? 0) > MAX_FILE_SIZE) {
        skipped.push(e.path);
        continue;
      }
      try {
        if (isBinaryPath(e.path)) {
          const b64 = await getBlobBase64(token, owner, name, e.sha);
          files[e.path] = encodeBinary(b64);
        } else {
          const text = await getBlobText(token, owner, name, e.sha);
          files[e.path] = text;
        }
      } catch {
        skipped.push(e.path);
      }
    }
  });
  await Promise.all(workers);

  return { files, commitSha, treeSha: commit.tree.sha, skipped };
}

