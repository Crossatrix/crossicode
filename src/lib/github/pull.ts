// @ts-ignore - no types
import diff3Module from "diff3";
import { getBranchHead, getCommit, getTreeRecursive, getBlobText } from "./repo";
import { b64encodeBytes, isBinaryPath } from "./client";
import type { PullResult, ConflictFile, BinaryUpdate } from "./types";

const diff3Merge: any = (diff3Module as any).diff3Merge || (diff3Module as any).default || diff3Module;

function threeWayMerge(base: string, ours: string, theirs: string): { merged: string; hasMarkers: boolean } {
  try {
    const baseLines = base.split("\n");
    const oursLines = ours.split("\n");
    const theirsLines = theirs.split("\n");
    const regions = diff3Merge(oursLines, baseLines, theirsLines);
    let out: string[] = [];
    let conflict = false;
    for (const r of regions) {
      if (r.ok) {
        out.push(...r.ok);
      } else if (r.conflict) {
        conflict = true;
        out.push("<<<<<<< ours");
        out.push(...r.conflict.a);
        out.push("=======");
        out.push(...r.conflict.b);
        out.push(">>>>>>> theirs");
      }
    }
    return { merged: out.join("\n"), hasMarkers: conflict };
  } catch {
    return {
      merged: `<<<<<<< ours\n${ours}\n=======\n${theirs}\n>>>>>>> theirs`,
      hasMarkers: true,
    };
  }
}

export async function pullFromRemote(
  token: string,
  owner: string,
  name: string,
  branch: string,
  baseCommitSha: string,
  baseFiles: Record<string, string>,
  currentFiles: Record<string, string>,
  baseBinaryFiles: Record<string, string>,
  currentBinaryFiles: Record<string, string>,
  onProgress?: (msg: string) => void
): Promise<PullResult> {
  onProgress?.("Fetching remote head\u2026");
  const remoteSha = await getBranchHead(token, owner, name, branch);
  if (remoteSha === baseCommitSha) {
    return { upToDate: true, newCommitSha: remoteSha, cleanUpdates: {}, conflicts: [], binaryUpdates: [] };
  }
  const remoteCommit = await getCommit(token, owner, name, remoteSha);
  onProgress?.("Reading remote tree\u2026");
  const remoteTree = await getTreeRecursive(token, owner, name, remoteCommit.tree.sha);

  const remoteBlobs = new Map<string, { sha: string; size: number }>();
  for (const e of remoteTree.tree) {
    if (e.type === "blob") remoteBlobs.set(e.path, { sha: e.sha, size: e.size ?? 0 });
  }

  const cleanUpdates: Record<string, string | null> = {};
  const conflicts: ConflictFile[] = [];
  const binaryUpdates: BinaryUpdate[] = [];

  const allPaths = new Set<string>([
    ...remoteBlobs.keys(),
    ...Object.keys(baseFiles),
    ...Object.keys(baseBinaryFiles),
  ]);
  let i = 0;
  for (const path of allPaths) {
    i++;
    if (i % 20 === 0) onProgress?.(`Comparing ${i}/${allPaths.size}\u2026`);
    const remote = remoteBlobs.get(path);
    const isBinary = isBinaryPath(path) || baseBinaryFiles[path] !== undefined || currentBinaryFiles[path] !== undefined;

    if (isBinary) {
      const baseContent = baseBinaryFiles[path];
      const localContent = currentBinaryFiles[path];
      const localChanged = localContent !== baseContent;

      if (!remote) {
        if (baseContent === undefined) continue;
        if (!localChanged) {
          binaryUpdates.push({ path, b64data: "", deleted: true });
        } else if (localContent === undefined) {
          continue;
        } else {
          conflicts.push({
            path,
            base: "",
            ours: "(binary, kept local)",
            theirs: "(binary, deleted on remote)",
            merged: "",
            hasMarkers: true,
          });
        }
        continue;
      }

      let remoteB64: string;
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${name}/git/blobs/${remote.sha}`, {
          headers: {
            Accept: "application/vnd.github.raw",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!res.ok) throw new Error("fetch failed");
        const buf = await res.arrayBuffer();
        remoteB64 = b64encodeBytes(buf);
      } catch {
        onProgress?.(`Warning: could not fetch binary ${path}`);
        continue;
      }

      if (baseContent === remoteB64) continue;
      if (!localChanged) {
        binaryUpdates.push({ path, b64data: remoteB64, deleted: false });
      } else if (localContent === remoteB64) {
        continue;
      } else {
        conflicts.push({
          path,
          base: "",
          ours: "(binary, kept local version)",
          theirs: "(remote version differs \u2014 manual merge required)",
          merged: "",
          hasMarkers: true,
        });
      }
      continue;
    }

    // Text file handling
    const baseContent = baseFiles[path];
    const localContent = currentFiles[path];
    const localChanged = localContent !== baseContent;

    if (!remote) {
      if (baseContent === undefined) continue;
      if (!localChanged) {
        cleanUpdates[path] = null;
      } else if (localContent === undefined) {
        continue;
      } else {
        conflicts.push({
          path,
          base: baseContent ?? "",
          ours: localContent,
          theirs: "",
          merged: `<<<<<<< ours\n${localContent}\n=======\n(deleted on remote)\n>>>>>>> theirs`,
          hasMarkers: true,
        });
      }
      continue;
    }

    if (remote.size > 5_000_000) {
      onProgress?.(`Skipping large text file: ${path}`);
      continue;
    }

    let remoteContent: string;
    try {
      remoteContent = await getBlobText(token, owner, name, remote.sha);
    } catch {
      continue;
    }

    if (baseContent === remoteContent) continue;
    if (!localChanged) {
      cleanUpdates[path] = remoteContent;
    } else if (localContent === remoteContent) {
      continue;
    } else {
      const { merged, hasMarkers } = threeWayMerge(baseContent ?? "", localContent ?? "", remoteContent);
      conflicts.push({
        path,
        base: baseContent ?? "",
        ours: localContent ?? "",
        theirs: remoteContent,
        merged,
        hasMarkers,
      });
    }
  }

  return { upToDate: false, newCommitSha: remoteSha, cleanUpdates, conflicts, binaryUpdates };
}
