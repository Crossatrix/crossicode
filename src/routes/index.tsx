import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Upload, Trash2, Code2, Download } from "lucide-react";
import { useEditorStore } from "../hooks/use-editor-store";
import { getFileTree } from "../lib/file-system";
import { FileTree } from "../components/FileTree";
import { CodeEditor } from "../components/CodeEditor";
import { ChatPanel } from "../components/ChatPanel";
import { ZipUploader } from "../components/ZipUploader";

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
  const [chatOpen, setChatOpen] = useState(true);

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
        </div>
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
            <div className="px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Explorer
            </div>
            <FileTree
              nodes={tree}
              onFileClick={store.openFile}
              onCreateFile={store.createFile}
              onDeleteFile={store.deleteFile}
              activeFile={store.activeTab}
            />
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
    </div>
  );
}
