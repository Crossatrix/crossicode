import { gh, b64encode, b64encodeBytes, GitHubError, isBinaryPath } from "./client";
import { getCommit } from "./repo";
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
  binaryFiles?: Record<string, string>;     // path -> base64
  baseBinaryFiles?: Record<string, string>;  // path -> base64 (to detect changes)
  message: string;
  selectedPaths?: string[]; // if set, only commit these
}

export interface PushResult {
  newCommitSha: string;
  newTreeSha: string;
  pushedFiles: string[];
  binaryFilesUploaded: number;
  binaryFilesSkipped: string[]; // paths that couldn't be uploaded
}

export async function commitAndPush(opts: PushOptions): Promise<PushResult> {
  const { token, owner, name, branch, baseCommitSha, files, baseFiles, binaryFiles, baseBinaryFiles, message, selectedPaths } = opts;

  // Compute text-only diffs first
  const textChanges = diffFiles(files, baseFiles);

  // Compute binary diffs
  const binaryChanges: FileChange[] = [];
  if (binaryFiles && baseBinaryFiles) {
    const binKeys = new Set([...Object.keys(binaryFiles), ...Object.keys(baseBinaryFiles)]);
    for (const path of binKeys) {
      const a = baseBinaryFiles[path];
      const b = binaryFiles[path];
      if (a === undefined && b !== undefined) binaryChanges.push({ path, status: "added" });
      else if (a !== undefined && b === undefined) binaryChanges.push({ path, status: "deleted" });
      else if (a !== b) binaryChanges.push({ path, status: "modified" });
    }
  }

  const allChanges = [...textChanges, ...binaryChanges].sort((a, b) => a.path.localeCompare(b.path));
  const changes = selectedPaths
    ? allChanges.filter((c) => selectedPaths.includes(c.path))
    : allChanges;

  if (changes.length === 0) throw new Error("No changes to commit");

  // Get base tree from baseCommitSha
  const baseCommit = await getCommit(token, owner, name, baseCommitSha);

  // Build tree entries
  const treeEntries: Array<{
    path: string;
    mode: "100644" | "100755";
    type: "blob";
    sha?: string | null;
    content?: string;
  }> = [];

  const binaryFilesSkipped: string[] = [];
  let binaryFilesUploaded = 0;

  for (const ch of changes) {
    if (ch.status === "deleted") {
      treeEntries.push({ path: ch.path, mode: "100644", type: "blob", sha: null });
    } else if (binaryFiles && binaryFiles[ch.path] !== undefined) {
      // Binary file: upload raw bytes as base64 blob
      try {
        const b64data = binaryFiles[ch.path];
        // Decode the base64 string back to ArrayBuffer for the blob API
        const binaryString = atob(b64data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const rawB64 = b64encodeBytes(bytes);

        const blob = await gh<{ sha: string }>(token, `/repos/${owner}/${name}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content: rawB64, encoding: "base64" }),
        });
        treeEntries.push({ path: ch.path, mode: "100644", type: "blob", sha: blob.sha });
        binaryFilesUploaded++;
      } catch {
        binaryFilesSkipped.push(ch.path);
      }
    } else {
      // Text file
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
    binaryFilesUploaded,
    binaryFilesSkipped,
  };
}
