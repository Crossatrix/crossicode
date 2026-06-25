import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { saveInstallation } from "@/lib/github.functions";

export const Route = createFileRoute("/github/callback")({
  component: GitHubCallback,
});

function GitHubCallback() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Finalising GitHub App install…");

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const idStr =
          params.get("installation_id") || params.get("installationId") || "";
        const id = Number(idStr);
        if (!Number.isFinite(id) || id <= 0) {
          throw new Error("No installation_id in callback URL.");
        }
        const res = await saveInstallation({ data: { installationId: id } });
        setStatus("done");
        setMessage(`Connected ${res.accountLogin}. You can close this window.`);
        try {
          window.opener?.postMessage(
            { type: "github-app-installed", installationId: id },
            window.location.origin
          );
        } catch {}
        setTimeout(() => {
          try {
            window.close();
          } catch {}
        }, 1500);
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#11111b] text-foreground p-4">
      <div className="max-w-md w-full bg-[#181825] border border-[#313244] rounded-lg p-6 space-y-3">
        <h1 className="text-base font-semibold">GitHub App</h1>
        <p
          className={
            status === "error"
              ? "text-sm text-red-400"
              : status === "done"
                ? "text-sm text-green-400"
                : "text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
        {status !== "working" && (
          <button
            onClick={() => window.close()}
            className="px-3 py-1.5 bg-[#313244] hover:bg-[#414155] text-xs rounded"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
