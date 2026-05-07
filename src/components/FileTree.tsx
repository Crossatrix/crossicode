import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, Trash2, FilePlus, FolderPlus } from "lucide-react";
import { type FileNode } from "../lib/file-system";

interface FileTreeProps {
  nodes: FileNode[];
  onFileClick: (path: string) => void;
  onCreateFile: (path: string, content?: string) => void;
  onDeleteFile: (path: string) => void;
  activeFile: string | null;
}

export function FileTree({ nodes, onFileClick, onCreateFile, onDeleteFile, activeFile }: FileTreeProps) {
  const [creatingAt, setCreatingAt] = useState<{ parent: string; type: "file" | "folder" } | null>(null);

  return (
    <div className="text-sm select-none">
      {/* Root-level create buttons */}
      <div className="flex items-center justify-end gap-0.5 px-2 pb-1">
        <button
          onClick={() => setCreatingAt({ parent: "", type: "file" })}
          className="p-1 hover:bg-accent/50 rounded"
          title="New file"
        >
          <FilePlus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => setCreatingAt({ parent: "", type: "folder" })}
          className="p-1 hover:bg-accent/50 rounded"
          title="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      {creatingAt?.parent === "" && (
        <NewItemInput
          type={creatingAt.type}
          depth={0}
          onSubmit={(name) => {
            if (name) {
              if (creatingAt.type === "file") {
                onCreateFile(name);
                onFileClick(name);
              } else {
                // Create folder by creating a placeholder that gets cleaned
                onCreateFile(name + "/.gitkeep", "");
              }
            }
            setCreatingAt(null);
          }}
          onCancel={() => setCreatingAt(null)}
        />
      )}
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          onFileClick={onFileClick}
          onCreateFile={onCreateFile}
          onDeleteFile={onDeleteFile}
          activeFile={activeFile}
          depth={0}
          creatingAt={creatingAt}
          setCreatingAt={setCreatingAt}
        />
      ))}
    </div>
  );
}

function NewItemInput({
  type,
  depth,
  onSubmit,
  onCancel,
}: {
  type: "file" | "folder";
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5"
      style={{ paddingLeft: `${depth * 12 + (type === "file" ? 20 : 8)}px` }}
    >
      {type === "file" ? (
        <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
      )}
      <input
        ref={ref}
        className="flex-1 bg-[#1e1e2e] text-foreground text-xs border border-blue-500 rounded px-1 py-0.5 outline-none"
        placeholder={type === "file" ? "filename.ext" : "folder-name"}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit((e.target as HTMLInputElement).value.trim());
          if (e.key === "Escape") onCancel();
        }}
        onBlur={(e) => onSubmit(e.target.value.trim())}
      />
    </div>
  );
}

function TreeNode({
  node,
  onFileClick,
  onCreateFile,
  onDeleteFile,
  activeFile,
  depth,
  creatingAt,
  setCreatingAt,
}: {
  node: FileNode;
  onFileClick: (path: string) => void;
  onCreateFile: (path: string, content?: string) => void;
  onDeleteFile: (path: string) => void;
  activeFile: string | null;
  depth: number;
  creatingAt: { parent: string; type: "file" | "folder" } | null;
  setCreatingAt: (v: { parent: string; type: "file" | "folder" } | null) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [hovered, setHovered] = useState(false);
  const isActive = activeFile === node.path;

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const colors: Record<string, string> = {
      ts: "text-blue-400",
      tsx: "text-blue-400",
      js: "text-yellow-400",
      jsx: "text-yellow-400",
      css: "text-pink-400",
      html: "text-orange-400",
      json: "text-green-400",
      md: "text-gray-400",
      py: "text-green-500",
    };
    return colors[ext || ""] || "text-muted-foreground";
  };

  if (node.type === "folder") {
    return (
      <div>
        <div
          className="flex items-center group"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 flex-1 min-w-0 px-2 py-0.5 hover:bg-accent/50 rounded text-muted-foreground hover:text-foreground transition-colors"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {hovered && (
            <div className="flex items-center gap-0.5 pr-1 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreatingAt({ parent: node.path, type: "file" }); }}
                className="p-0.5 hover:bg-accent/50 rounded"
                title="New file"
              >
                <FilePlus className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreatingAt({ parent: node.path, type: "folder" }); }}
                className="p-0.5 hover:bg-accent/50 rounded"
                title="New folder"
              >
                <FolderPlus className="h-3 w-3 text-muted-foreground" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${node.name}" and all contents?`)) onDeleteFile(node.path); }}
                className="p-0.5 hover:bg-accent/50 rounded"
                title="Delete folder"
              >
                <Trash2 className="h-3 w-3 text-red-400" />
              </button>
            </div>
          )}
        </div>
        {expanded && (
          <>
            {creatingAt?.parent === node.path && (
              <NewItemInput
                type={creatingAt.type}
                depth={depth + 1}
                onSubmit={(name) => {
                  if (name) {
                    const fullPath = node.path + "/" + name;
                    if (creatingAt.type === "file") {
                      onCreateFile(fullPath);
                      onFileClick(fullPath);
                    } else {
                      onCreateFile(fullPath + "/.gitkeep", "");
                    }
                  }
                  setCreatingAt(null);
                }}
                onCancel={() => setCreatingAt(null)}
              />
            )}
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                onFileClick={onFileClick}
                onCreateFile={onCreateFile}
                onDeleteFile={onDeleteFile}
                activeFile={activeFile}
                depth={depth + 1}
                creatingAt={creatingAt}
                setCreatingAt={setCreatingAt}
              />
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onFileClick(node.path)}
        className={`flex items-center gap-1 flex-1 min-w-0 px-2 py-0.5 rounded transition-colors ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        <File className={`h-3.5 w-3.5 shrink-0 ${getFileIcon(node.name)}`} />
        <span className="truncate">{node.name}</span>
      </button>
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${node.name}"?`)) onDeleteFile(node.path); }}
          className="p-0.5 hover:bg-accent/50 rounded pr-1 shrink-0"
          title="Delete file"
        >
          <Trash2 className="h-3 w-3 text-red-400" />
        </button>
      )}
    </div>
  );
}
