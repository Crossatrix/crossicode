import { gh } from "./client";

export async function createBranch(
  token: string,
  owner: string,
  name: string,
  newBranch: string,
  fromSha: string
) {
  return gh(token, `/repos/${owner}/${name}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  });
}

export async function createPullRequest(
  token: string,
  owner: string,
  name: string,
  opts: { title: string; body: string; head: string; base: string }
) {
  return gh<{ html_url: string; number: number }>(
    token,
    `/repos/${owner}/${name}/pulls`,
    {
      method: "POST",
      body: JSON.stringify(opts),
    }
  );
}
