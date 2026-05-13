const API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function gh<T = any>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.message || msg;
    } catch {}
    throw new GitHubError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const s = input.trim().replace(/\.git$/, "");
  // owner/name
  const slash = s.match(/^([^\/\s]+)\/([^\/\s]+)$/);
  if (slash) return { owner: slash[1], name: slash[2] };
  // url
  const url = s.match(/github\.com[:/]([^\/\s]+)\/([^\/\s]+)/);
  if (url) return { owner: url[1], name: url[2] };
  return null;
}

// Base64 encode/decode for UTF-8 strings
export function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}
