import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";
import { type FileNode } from "../lib/file-system";

interface FileTreeProps {
  nodes: FileNode[];
  onFileClick: (path: string) => void;
  activeFile: string | null;
}

export function FileTree({ nodes, onFileClick, activeFile }: FileTreeProps) {
  return (
    <div className="text-sm select-none">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          onFileClick={onFileClick}
          activeFile={activeFile}
          depth={0}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  onFileClick,
  activeFile,
  depth,
}: {
  node: FileNode;
  onFileClick: (path: string) => void;
  activeFile: string | null;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
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
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full px-2 py-0.5 hover:bg-accent/50 rounded text-muted-foreground hover:text-foreground transition-colors"
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
        {expanded && node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            onFileClick={onFileClick}
            activeFile={activeFile}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileClick(node.path)}
      className={`flex items-center gap-1 w-full px-2 py-0.5 rounded transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <File className={`h-3.5 w-3.5 shrink-0 ${getFileIcon(node.name)}`} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
