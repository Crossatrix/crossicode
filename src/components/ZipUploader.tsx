import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { Upload, FolderUp } from "lucide-react";

interface ZipUploaderProps {
  onFilesLoaded: (files: Record<string, string>) => void;
}

export function ZipUploader({ onFilesLoaded }: ZipUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processZip = useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const zip = await JSZip.loadAsync(file);
        const files: Record<string, string> = {};

        const entries = Object.entries(zip.files).filter(
          ([, f]) => !f.dir
        );

        for (const [path, zipEntry] of entries) {
          // Skip binary files, hidden files, node_modules
          if (
            path.includes("node_modules/") ||
            path.includes(".git/") ||
            path.startsWith("__MACOSX/") ||
            path.startsWith(".")
          )
            continue;

          try {
            const content = await zipEntry.async("string");
            // Remove the top-level folder prefix if all files share one
            files[path] = content;
          } catch {
            // skip binary files
          }
        }

        // Normalize paths: strip common prefix
        const keys = Object.keys(files);
        if (keys.length > 0) {
          const parts = keys[0].split("/");
          let commonPrefix = "";
          for (let i = 0; i < parts.length - 1; i++) {
            const prefix = parts.slice(0, i + 1).join("/") + "/";
            if (keys.every((k) => k.startsWith(prefix))) {
              commonPrefix = prefix;
            } else break;
          }

          if (commonPrefix) {
            const normalized: Record<string, string> = {};
            for (const [k, v] of Object.entries(files)) {
              normalized[k.slice(commonPrefix.length)] = v;
            }
            onFilesLoaded(normalized);
            return;
          }
        }

        onFilesLoaded(files);
      } catch (err) {
        alert("Failed to read zip file: " + (err instanceof Error ? err.message : "Unknown error"));
      } finally {
        setLoading(false);
      }
    },
    [onFilesLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".zip")) {
        processZip(file);
      }
    },
    [processZip]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processZip(file);
    },
    [processZip]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
        dragging
          ? "border-blue-500 bg-blue-500/10"
          : "border-[#313244] hover:border-[#45475a] bg-[#1e1e2e]/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        onChange={handleChange}
        className="hidden"
      />
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Extracting files...</span>
        </div>
      ) : (
        <>
          <div className="p-3 rounded-full bg-blue-500/10">
            <FolderUp className="h-8 w-8 text-blue-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop a .zip file or click to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Your code stays in your browser (localStorage)
            </p>
          </div>
        </>
      )}
    </div>
  );
}
