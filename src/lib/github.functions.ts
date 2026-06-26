import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface GhCallInput {
  path: string;
  method?: string;
  body?: string;
}

export interface GhCallResult {
  status: number;
  body: any;
  message?: string;
}

export const ghCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GhCallInput) => {
    if (!data?.path || typeof data.path !== "string") throw new Error("path required");
    if (!data.path.startsWith("/")) throw new Error("path must start with /");
    return {
      path: data.path,
      method: (data.method || "GET").toUpperCase(),
      body: typeof data.body === "string" ? data.body : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("github_installations")
      .select("installation_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("GitHub App not installed. Connect GitHub first.");

    const { getInstallationToken } = await import("./github-app/token.server");
    const token = await getInstallationToken(Number(row.installation_id));

    const res = await fetch("https://api.github.com" + data.path, {
      method: data.method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(data.body ? { "Content-Type": "application/json" } : {}),
      },
      body: data.body,
    });

    let body: any = null;
    let message: string | undefined;
    if (res.status !== 204) {
      const text = await res.text();
      if (text) {
        try {
          body = JSON.parse(text);
          if (!res.ok && body && typeof body.message === "string") message = body.message;
        } catch {
          body = text;
        }
      }
    }
    return { status: res.status, body, message } as GhCallResult;
  });

export const saveInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { installationId: number }) => {
    const id = Number(data?.installationId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid installationId");
    return { installationId: id };
  })
  .handler(async ({ data, context }) => {
    const { getInstallationAccount } = await import("./github-app/token.server");
    const accountLogin = await getInstallationAccount(data.installationId);
    const { error } = await context.supabase
      .from("github_installations")
      .upsert(
        {
          user_id: context.userId,
          installation_id: data.installationId,
          account_login: accountLogin,
        },
        { onConflict: "user_id" }
      );
    if (error) throw new Error(error.message);
    return { installationId: data.installationId, accountLogin };
  });

export const removeInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("github_installations")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyInstallation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("github_installations")
      .select("installation_id, account_login")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      installationId: Number(data.installation_id),
      accountLogin: data.account_login as string,
    };
  });

export const listAppInstallations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listAppInstallations: list } = await import("./github-app/token.server");
    return await list();
  });

