import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Upload, Trash2, Code2, Download, Files, Search, Smartphone, Cloud, LogIn, LogOut } from "lucide-react";
import { useEditorStore } from "../hooks/use-editor-store";
import { getFileTree } from "../lib/file-system";
import { FileTree } from "../components/FileTree";
import { CodeEditor } from "../components/CodeEditor";
import { ChatPanel } from "../components/ChatPanel";
import { ZipUploader } from "../components/ZipUploader";
import { SearchPanel } from "../components/SearchPanel";
import { AuthDialog } from "../components/AuthDialog";
import { CloudProjectsDialog } from "../components/CloudProjectsDialog";
import { useAuth } from "../lib/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AI Code Editor" },
      { name: "description", content: "Browser-based code editor with AI assistance" },
    ],
  }),
});

function Index() {
  const store = useEditorStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarMode, setSidebarMode] = useState<"files" | "search">("files");
  const [chatOpen, setChatOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setIsInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) {
      alert(
        "To install: in Chrome/Edge tap the install icon in the address bar. On iOS Safari, tap Share → Add to Home Screen."
      );
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  const hasFiles = Object.keys(store.files).length > 0;
  const tree = getFileTree(store.files);

  const handleFileRead = useCallback(
    (path: string) => store.filesRef.current[path],
    [store.filesRef]
  );

  const handleFileEdit = useCallback(
    (path: string, content: string) => {
      const before = store.filesRef.current[path] ?? "";
      store.addDiff(path, before, content);
      store.updateFile(path, content);
    },
    [store]
  );

  const handleDownloadZip = useCallback(async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const [path, content] of Object.entries(store.files)) {
      zip.file(path, content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [store.files]);

  if (!hasFiles) {
    return (
      <div className="min-h-screen bg-[#11111b] flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-blue-500/10 mb-2">
              <Code2 className="h-10 w-10 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">AI Code Editor</h1>
            <p className="text-sm text-muted-foreground">
              Upload your project as a .zip file. Edit code with AI assistance.
              <br />
              Everything stays in your browser — no login needed.
            </p>
          </div>
          <ZipUploader onFilesLoaded={store.importFiles} />
          <div className="text-center">
            {user ? (
              <button
                onClick={() => setCloudOpen(true)}
                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <Cloud className="h-3 w-3" /> Load from cloud
              </button>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <LogIn className="h-3 w-3" /> Sign in to sync projects (optional)
              </button>
            )}
          </div>
        </div>
        {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
        {cloudOpen && user && (
          <CloudProjectsDialog
            files={store.files}
            onClose={() => setCloudOpen(false)}
            onLoad={store.importFiles}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#11111b] text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-accent/50 rounded"
            title="Toggle file tree"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Code2 className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">AI Code Editor</span>
        </div>
        <div className="flex items-center gap-1">
          {user ? (
            <>
              <button
                onClick={() => setCloudOpen(true)}
                className="p-1.5 hover:bg-accent/50 rounded"
                title="Cloud projects"
              >
                <Cloud className="h-4 w-4 text-blue-400" />
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="p-1.5 hover:bg-accent/50 rounded"
                title={`Sign out (${user.email})`}
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="p-1.5 hover:bg-accent/50 rounded"
              title="Sign in (optional)"
            >
              <LogIn className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {!isInstalled && (
            <button
              onClick={handleInstall}
              className="p-1.5 hover:bg-accent/50 rounded"
              title="Install as app (PWA)"
            >
              <Smartphone className="h-4 w-4 text-blue-400" />
            </button>
          )}
          <label className="p-1.5 hover:bg-accent/50 rounded cursor-pointer" title="Upload new zip">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <input
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  import("jszip").then(({ default: JSZip }) => {
                    JSZip.loadAsync(file).then(async (zip) => {
                      const files: Record<string, string> = {};
                      for (const [path, entry] of Object.entries(zip.files)) {
                        if (entry.dir || path.includes("node_modules/") || path.includes(".git/") || path.startsWith("__MACOSX/")) continue;
                        try {
                          files[path] = await entry.async("string");
                        } catch {}
                      }
                      // Normalize common prefix
                      const keys = Object.keys(files);
                      if (keys.length > 0) {
                        const parts = keys[0].split("/");
                        let commonPrefix = "";
                        for (let i = 0; i < parts.length - 1; i++) {
                          const prefix = parts.slice(0, i + 1).join("/") + "/";
                          if (keys.every((k) => k.startsWith(prefix))) commonPrefix = prefix;
                          else break;
                        }
                        if (commonPrefix) {
                          const normalized: Record<string, string> = {};
                          for (const [k, v] of Object.entries(files)) normalized[k.slice(commonPrefix.length)] = v;
                          store.importFiles(normalized);
                          return;
                        }
                      }
                      store.importFiles(files);
                    });
                  });
                }
              }}
            />
          </label>
          <button
            onClick={handleDownloadZip}
            className="p-1.5 hover:bg-accent/50 rounded"
            title="Download as zip"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={store.clearAll}
            className="p-1.5 hover:bg-accent/50 rounded"
            title="Clear project"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="p-1.5 hover:bg-accent/50 rounded"
            title="Toggle AI chat"
          >
            {chatOpen ? (
              <PanelRightClose className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 bg-[#181825] border-r border-[#313244] overflow-y-auto py-2">
            <div className="px-2 pb-2 flex items-center gap-1">
              <button
                onClick={() => setSidebarMode("files")}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold ${sidebarMode === "files" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                <Files className="h-3 w-3" /> Files
              </button>
              <button
                onClick={() => setSidebarMode("search")}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold ${sidebarMode === "search" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                <Search className="h-3 w-3" /> Search
              </button>
            </div>
            {sidebarMode === "files" ? (
              <FileTree
                nodes={tree}
                onFileClick={store.openFile}
                onCreateFile={store.createFile}
                onDeleteFile={store.deleteFile}
                activeFile={store.activeTab}
              />
            ) : (
              <SearchPanel files={store.files} onFileOpen={store.openFile} />
            )}
          </div>
        )}

        {/* Editor */}
        <CodeEditor
          files={store.files}
          openTabs={store.openTabs}
          activeTab={store.activeTab}
          onTabClick={store.setActiveTab}
          onTabClose={store.closeTab}
          onFileChange={store.updateFile}
        />

        {/* Chat */}
        {chatOpen && (
          <div className="w-80 shrink-0 border-l border-[#313244]">
            <ChatPanel
              messages={store.chatMessages}
              setMessages={store.setChatMessages}
              files={store.files}
              filesRef={store.filesRef}
              apiKey={store.apiKey}
              setApiKey={store.setApiKey}
              model={store.model}
              setModel={store.setModel}
              onFileRead={handleFileRead}
              onFileEdit={handleFileEdit}
              onFileCreate={store.createFile}
              onFileDelete={store.deleteFile}
              diffs={store.diffs}
              onRevertDiff={store.revertDiff}
            />
          </div>
        )}
      </div>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {cloudOpen && user && (
        <CloudProjectsDialog
          files={store.files}
          onClose={() => setCloudOpen(false)}
          onLoad={store.importFiles}
        />
      )}
    </div>
  );
}
