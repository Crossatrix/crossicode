import { ghCall } from "../github.functions";

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Proxy all GitHub API calls through our server function so the installation
 * token (minted from the GitHub App private key) never reaches the browser.
 * The first arg is kept for backward compat with existing callers and ignored.
 */
export async function gh<T = any>(
  _ignoredToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const body =
    init?.body == null
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);

  const res = await ghCall({
    data: {
      path,
      method: (init?.method || "GET").toUpperCase(),
      body,
    },
  });

  if (res.status >= 400) {
    throw new GitHubError(res.status, res.message || `GitHub ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.body as T;
}

export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const s = input.trim().replace(/\.git$/, "");
  const slash = s.match(/^([^\/\s]+)\/([^\/\s]+)$/);
  if (slash) return { owner: slash[1], name: slash[2] };
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
