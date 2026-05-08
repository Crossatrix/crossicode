import { useState, useMemo } from "react";
import { Search, X, CaseSensitive, Regex } from "lucide-react";

interface SearchPanelProps {
  files: Record<string, string>;
  onFileOpen: (path: string) => void;
}

interface Match {
  path: string;
  line: number;
  text: string;
  start: number;
  end: number;
}

export function SearchPanel({ files, onFileOpen }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const { matches, error, fileCount } = useMemo(() => {
    if (!query) return { matches: [] as Match[], error: null as string | null, fileCount: 0 };
    let regex: RegExp;
    try {
      regex = useRegex
        ? new RegExp(query, caseSensitive ? "g" : "gi")
        : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
    } catch (e) {
      return { matches: [], error: (e as Error).message, fileCount: 0 };
    }
    const out: Match[] = [];
    const filesWithMatches = new Set<string>();
    for (const [path, content] of Object.entries(files)) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(line)) !== null) {
          out.push({ path, line: i + 1, text: line, start: m.index, end: m.index + m[0].length });
          filesWithMatches.add(path);
          if (m[0].length === 0) regex.lastIndex++;
          if (out.length > 500) break;
        }
        if (out.length > 500) break;
      }
      if (out.length > 500) break;
    }
    return { matches: out, error: null, fileCount: filesWithMatches.size };
  }, [query, files, caseSensitive, useRegex]);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      if (!map.has(m.path)) map.set(m.path, []);
      map.get(m.path)!.push(m);
    }
    return Array.from(map.entries());
  }, [matches]);

  return (
    <div className="text-sm">
      <div className="px-2 pb-2 space-y-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files..."
            className="w-full text-xs bg-[#1e1e2e] border border-[#313244] rounded pl-7 pr-7 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent/50 rounded"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`p-1 rounded text-[10px] ${caseSensitive ? "bg-blue-600/30 text-blue-300" : "hover:bg-accent/50 text-muted-foreground"}`}
            title="Match Case"
          >
            <CaseSensitive className="h-3 w-3" />
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={`p-1 rounded text-[10px] ${useRegex ? "bg-blue-600/30 text-blue-300" : "hover:bg-accent/50 text-muted-foreground"}`}
            title="Regex"
          >
            <Regex className="h-3 w-3" />
          </button>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {error ? <span className="text-red-400">{error}</span> : query ? `${matches.length} in ${fileCount}` : ""}
          </span>
        </div>
      </div>
      <div>
        {grouped.map(([path, ms]) => (
          <SearchFileGroup key={path} path={path} matches={ms} onOpen={() => onFileOpen(path)} />
        ))}
      </div>
    </div>
  );
}

function SearchFileGroup({ path, matches, onOpen }: { path: string; matches: Match[]; onOpen: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-accent/50 text-foreground"
      >
        <span className="truncate flex-1 text-left">{path}</span>
        <span className="text-[10px] text-muted-foreground">{matches.length}</span>
      </button>
      {open && (
        <div>
          {matches.map((m, i) => (
            <button
              key={i}
              onClick={onOpen}
              className="w-full text-left px-2 py-0.5 hover:bg-accent/50 text-[11px] font-mono text-muted-foreground flex gap-2"
              style={{ paddingLeft: 24 }}
              title={`Line ${m.line}`}
            >
              <span className="text-muted-foreground/50 shrink-0">{m.line}</span>
              <span className="truncate">
                {m.text.slice(Math.max(0, m.start - 20), m.start)}
                <span className="bg-yellow-500/30 text-yellow-200">{m.text.slice(m.start, m.end)}</span>
                {m.text.slice(m.end, m.end + 60)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
