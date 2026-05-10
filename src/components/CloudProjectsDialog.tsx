import { useEffect, useState, useCallback } from "react";
import { X, Cloud, Trash2, FolderOpen, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  id: string;
  name: string;
  updated_at: string;
}

export function CloudProjectsDialog({
  files,
  onClose,
  onLoad,
}: {
  files: Record<string, string>;
  onClose: () => void;
  onLoad: (files: Record<string, string>) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("My Project");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,updated_at")
      .order("updated_at", { ascending: false });
    if (!error && data) setRows(data as Row[]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("projects").insert({
        user_id: u.user.id,
        name: name || "Untitled",
        files: files as any,
      });
      if (error) throw error;
      setMsg("Saved to cloud.");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ files: files as any, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setMsg("Project updated.");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const load = async (id: string) => {
    const { data, error } = await supabase.from("projects").select("files").eq("id", id).single();
    if (error) {
      setMsg(error.message);
      return;
    }
    onLoad((data?.files as Record<string, string>) || {});
    onClose();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this cloud project?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) setMsg(error.message);
    else refresh();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#181825] border border-[#313244] rounded-lg w-full max-w-md p-5 space-y-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-400" /> Cloud Projects
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-accent/50 rounded">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1 px-3 py-2 bg-[#11111b] border border-[#313244] rounded text-sm text-foreground"
          />
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded text-sm font-medium flex items-center gap-1"
          >
            <Save className="h-3 w-3" /> Save new
          </button>
        </div>

        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

        <div className="flex-1 overflow-y-auto space-y-1">
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No saved projects yet.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent/30 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground truncate">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(r.updated_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => update(r.id)}
                title="Overwrite with current files"
                className="p-1.5 hover:bg-accent/50 rounded"
              >
                <Save className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => load(r.id)}
                title="Load"
                className="p-1.5 hover:bg-accent/50 rounded"
              >
                <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
              </button>
              <button
                onClick={() => remove(r.id)}
                title="Delete"
                className="p-1.5 hover:bg-accent/50 rounded"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
