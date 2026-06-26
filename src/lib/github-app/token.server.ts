import { signAppJwt } from "./jwt.server";

interface CachedToken {
  token: string;
  expiresAt: number; // ms
}

const cache = new Map<number, CachedToken>();

function getEnv() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error(
      "GitHub App not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY secrets."
    );
  }
  return { appId, privateKey };
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const now = Date.now();
  const cached = cache.get(installationId);
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  const { appId, privateKey } = getEnv();
  const jwt = await signAppJwt(appId, privateKey);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to mint installation token (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { token: string; expires_at: string };
  const expiresAt = new Date(json.expires_at).getTime();
  cache.set(installationId, { token: json.token, expiresAt });
  return json.token;
}

export async function getInstallationAccount(installationId: number): Promise<string> {
  const { appId, privateKey } = getEnv();
  const jwt = await signAppJwt(appId, privateKey);
  const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to read installation (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { account?: { login?: string; slug?: string } };
  return json.account?.login || json.account?.slug || "unknown";
}

export interface AppInstallationSummary {
  id: number;
  accountLogin: string;
  accountType: string;
  targetType: string;
}

export async function listAppInstallations(): Promise<AppInstallationSummary[]> {
  const { appId, privateKey } = getEnv();
  const jwt = await signAppJwt(appId, privateKey);
  const results: AppInstallationSummary[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`https://api.github.com/app/installations?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to list installations (${res.status}): ${body}`);
    }
    const rows = (await res.json()) as Array<{
      id: number;
      account?: { login?: string; slug?: string; type?: string };
      target_type?: string;
    }>;
    for (const r of rows) {
      results.push({
        id: r.id,
        accountLogin: r.account?.login || r.account?.slug || "unknown",
        accountType: r.account?.type || "",
        targetType: r.target_type || "",
      });
    }
    if (rows.length < 100) break;
    page++;
    if (page > 10) break;
  }
  return results;
}

