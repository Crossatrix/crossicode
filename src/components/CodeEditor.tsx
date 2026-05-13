import { useRef, useEffect, useCallback } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { X } from "lucide-react";

interface CodeEditorProps {
  files: Record<string, string>;
  openTabs: string[];
  activeTab: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onFileChange: (path: string, content: string) => void;
}

function getLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "jsx": return javascript({ jsx: true });
    case "ts": case "tsx": return javascript({ jsx: true, typescript: true });
    case "html": case "htm": return html();
    case "css": case "scss": return css();
    case "json": return json();
    case "py": return python();
    case "md": case "mdx": return markdown();
    default: return javascript();
  }
}

import { isBinaryEncoded, decodeBinaryBase64, binaryByteLength } from "../lib/github/binary";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico"]);

function isImageFile(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTS.has(ext);
}

function mimeFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "gif" ? "image/gif"
    : ext === "webp" ? "image/webp"
    : ext === "bmp" ? "image/bmp"
    : ext === "ico" ? "image/x-icon"
    : ext === "svg" ? "image/svg+xml"
    : "application/octet-stream";
}

function getImageDataUrl(path: string, content: string) {
  if (isBinaryEncoded(content)) {
    return `data:${mimeFor(path)};base64,${decodeBinaryBase64(content)}`;
  }
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (ext === "svg") return `data:image/svg+xml;base64,${btoa(content)}`;
  const mime = mimeFor(path);
  const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(content) && content.length > 32;
  if (isBase64) return `data:${mime};base64,${content.replace(/\s/g, "")}`;
  return `data:${mime};base64,${btoa(content)}`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function CodeEditor({
  files,
  openTabs,
  activeTab,
  onTabClick,
  onTabClose,
  onFileChange,
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onFileChange);
  onChangeRef.current = onFileChange;

  const activeContent = activeTab ? files[activeTab] ?? "" : "";
  const activeIsBinary = isBinaryEncoded(activeContent);
  const activeIsImage = !!activeTab && (isImageFile(activeTab) || (activeIsBinary && /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(activeTab)));

  useEffect(() => {
    if (!editorRef.current || !activeTab || activeIsImage || activeIsBinary) {
      if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }
      return;
    }

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const currentPath = activeTab;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(currentPath, update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: activeContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        getLanguage(activeTab),
        oneDark,
        keymap.of([...defaultKeymap, indentWithTab]),
        updateListener,
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
          ".cm-content": { minHeight: "100%" },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [activeTab]);

  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e2e] text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No file open</p>
          <p className="text-sm">Select a file from the tree or upload a zip</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e2e] overflow-hidden">
      {/* Tabs */}
      <div className="flex bg-[#181825] border-b border-[#313244] overflow-x-auto scrollbar-none">
        {openTabs.map((tab) => {
          const name = tab.split("/").pop();
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              onClick={() => onTabClick(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-[#313244] shrink-0 transition-colors ${
                isActive
                  ? "bg-[#1e1e2e] text-foreground border-t-2 border-t-blue-500"
                  : "text-muted-foreground hover:bg-[#1e1e2e]/50"
              }`}
            >
              <span>{name}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab);
                }}
                className="hover:bg-accent/50 rounded p-0.5"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
      {/* Editor or Image Preview */}
      {activeTab && isImageFile(activeTab) ? (
        <div className="flex-1 flex items-center justify-center overflow-auto bg-[#1e1e2e] p-4">
          <img
            src={getImageDataUrl(activeTab, activeContent)}
            alt={activeTab.split("/").pop() || "image"}
            className="max-w-full max-h-full object-contain rounded shadow-lg"
          />
        </div>
      ) : (
        <div ref={editorRef} className="flex-1 overflow-hidden" />
      )}
    </div>
  );
}
