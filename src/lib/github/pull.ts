// @ts-ignore - no types
import diff3Module from "diff3";
import { getBranchHead, getCommit, getTreeRecursive, getBlobText, getBlobBase64 } from "./repo";
import { isBinaryPath, encodeBinary, isBinaryEncoded } from "./binary";
import type { PullResult, ConflictFile } from "./types";

const diff3Merge: any = (diff3Module as any).diff3Merge || (diff3Module as any).default || diff3Module;

const MAX_FILE_SIZE = 25 * 1024 * 1024;

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
  onProgress?: (msg: string) => void
): Promise<PullResult> {
  onProgress?.("Fetching remote head…");
  const remoteSha = await getBranchHead(token, owner, name, branch);
  if (remoteSha === baseCommitSha) {
    return { upToDate: true, newCommitSha: remoteSha, cleanUpdates: {}, conflicts: [] };
  }
  const remoteCommit = await getCommit(token, owner, name, remoteSha);
  onProgress?.("Reading remote tree…");
  const remoteTree = await getTreeRecursive(token, owner, name, remoteCommit.tree.sha);

  const remoteBlobs = new Map<string, { sha: string; size: number }>();
  for (const e of remoteTree.tree) {
    if (e.type === "blob") remoteBlobs.set(e.path, { sha: e.sha, size: e.size ?? 0 });
  }

  const cleanUpdates: Record<string, string | null> = {};
  const conflicts: ConflictFile[] = [];

  // Files present in remote
  const allPaths = new Set<string>([...remoteBlobs.keys(), ...Object.keys(baseFiles)]);
  let i = 0;
  for (const path of allPaths) {
    i++;
    if (i % 20 === 0) onProgress?.(`Comparing ${i}/${allPaths.size}…`);
    const remote = remoteBlobs.get(path);
    const baseContent = baseFiles[path];
    const localContent = currentFiles[path];
    const localChanged = localContent !== baseContent;

    if (!remote) {
      // Remote deleted
      if (baseContent === undefined) continue;
      if (!localChanged) {
        cleanUpdates[path] = null;
      } else if (localContent === undefined) {
        // both deleted
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

    // Skip large/binary
    if (remote.size > 1_000_000 || SKIP_BINARY_EXT.test(path)) continue;

    let remoteContent: string;
    try {
      remoteContent = await getBlobText(token, owner, name, remote.sha);
    } catch {
      continue;
    }

    if (baseContent === remoteContent) continue; // no remote change
    if (!localChanged) {
      cleanUpdates[path] = remoteContent;
    } else if (localContent === remoteContent) {
      // same edit
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

  return { upToDate: false, newCommitSha: remoteSha, cleanUpdates, conflicts };
}
