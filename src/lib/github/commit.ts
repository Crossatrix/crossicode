import { gh, b64encode, GitHubError } from "./client";
import { getCommit } from "./repo";
import { isBinaryEncoded, decodeBinaryBase64 } from "./binary";
import type { FileChange } from "./types";

export function diffFiles(
  current: Record<string, string>,
  base: Record<string, string>
): FileChange[] {
  const changes: FileChange[] = [];
  const keys = new Set([...Object.keys(current), ...Object.keys(base)]);
  for (const path of keys) {
    const a = base[path];
    const b = current[path];
    if (a === undefined && b !== undefined) changes.push({ path, status: "added" });
    else if (a !== undefined && b === undefined) changes.push({ path, status: "deleted" });
    else if (a !== b) changes.push({ path, status: "modified" });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

export interface PushOptions {
  token: string;
  owner: string;
  name: string;
  branch: string;
  baseCommitSha: string;
  files: Record<string, string>;
  baseFiles: Record<string, string>;
  message: string;
  selectedPaths?: string[]; // if set, only commit these
}

export interface PushResult {
  newCommitSha: string;
  newTreeSha: string;
  pushedFiles: string[];
}

export async function commitAndPush(opts: PushOptions): Promise<PushResult> {
  const { token, owner, name, branch, baseCommitSha, files, baseFiles, message, selectedPaths } = opts;

  const allChanges = diffFiles(files, baseFiles);
  const changes = selectedPaths
    ? allChanges.filter((c) => selectedPaths.includes(c.path))
    : allChanges;

  if (changes.length === 0) throw new Error("No changes to commit");

  // Get base tree from baseCommitSha
  const baseCommit = await getCommit(token, owner, name, baseCommitSha);

  // Build tree entries
  const treeEntries: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha?: string | null;
    content?: string;
  }> = [];

  for (const ch of changes) {
    if (ch.status === "deleted") {
      treeEntries.push({ path: ch.path, mode: "100644", type: "blob", sha: null });
    } else {
      // Create blob
      const content = files[ch.path];
      const blob = await gh<{ sha: string }>(token, `/repos/${owner}/${name}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: b64encode(content), encoding: "base64" }),
      });
      treeEntries.push({ path: ch.path, mode: "100644", type: "blob", sha: blob.sha });
    }
  }

  const newTree = await gh<{ sha: string }>(token, `/repos/${owner}/${name}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }),
  });

  const newCommit = await gh<{ sha: string }>(token, `/repos/${owner}/${name}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommitSha] }),
  });

  // Update ref — non-fast-forward fails
  try {
    await gh(token, `/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 422 || e.status === 409)) {
      throw new Error("Remote has new commits. Pull first, then push again.");
    }
    throw e;
  }

  return {
    newCommitSha: newCommit.sha,
    newTreeSha: newTree.sha,
    pushedFiles: changes.map((c) => c.path),
  };
}
