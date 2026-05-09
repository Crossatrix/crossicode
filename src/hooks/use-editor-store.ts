import { useState, useCallback, useRef, useEffect } from "react";
import { loadFiles, saveFiles, clearFiles, type VirtualFile } from "../lib/file-system";

export interface DiffEntry {
  id: string;
  path: string;
  before: string;
  after: string;
  timestamp: number;
  reverted: boolean;
}

const CHAT_KEY = "code-editor-chat";
const DIFF_KEY = "code-editor-diffs";
const API_KEY_KEY = "code-editor-api-key";
const MODEL_KEY = "code-editor-model";
const DEFAULT_MODEL = "baidu/cobuddy:free";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export function useEditorStore() {
  const [files, setFilesState] = useState<Record<string, string>>(loadFiles);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [diffs, setDiffs] = useState<DiffEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(DIFF_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [apiKey, setApiKeyState] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem(API_KEY_KEY) || ""));
  const [model, setModelState] = useState(() => (typeof window === "undefined" ? DEFAULT_MODEL : localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL));

  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatMessages)); } catch {}
  }, [chatMessages]);

  useEffect(() => {
    try { localStorage.setItem(DIFF_KEY, JSON.stringify(diffs)); } catch {}
  }, [diffs]);

  const setFiles = useCallback((newFiles: Record<string, string>) => {
    setFilesState(newFiles);
    saveFiles(newFiles);
  }, []);

  const updateFile = useCallback((path: string, content: string) => {
    setFilesState((prev) => {
      const next = { ...prev, [path]: content };
      saveFiles(next);
      return next;
    });
  }, []);

  const openFile = useCallback((path: string) => {
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveTab(path);
  }, []);

  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      return next;
    });
    setActiveTab((prev) => {
      if (prev === path) {
        const tabs = openTabs.filter((p) => p !== path);
        return tabs.length > 0 ? tabs[tabs.length - 1] : null;
      }
      return prev;
    });
  }, [openTabs]);

  const createFile = useCallback((path: string, content = "") => {
    setFilesState((prev) => {
      const next = { ...prev, [path]: content };
      saveFiles(next);
      return next;
    });
  }, []);

  const deleteFile = useCallback((path: string) => {
    setFilesState((prev) => {
      const next = { ...prev };
      // Delete file or all files under folder path
      for (const key of Object.keys(next)) {
        if (key === path || key.startsWith(path + "/")) {
          delete next[key];
        }
      }
      saveFiles(next);
      return next;
    });
    setOpenTabs((prev) => prev.filter((t) => t !== path && !t.startsWith(path + "/")));
    setActiveTab((prev) => {
      if (prev === path || (prev && prev.startsWith(path + "/"))) return null;
      return prev;
    });
  }, []);

  const importFiles = useCallback((newFiles: Record<string, string>) => {
    setFiles(newFiles);
    setOpenTabs([]);
    setActiveTab(null);
  }, [setFiles]);

  const clearAll = useCallback(() => {
    clearFiles();
    setFilesState({});
    setOpenTabs([]);
    setActiveTab(null);
    setChatMessages([]);
    setDiffs([]);
  }, []);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    localStorage.setItem(API_KEY_KEY, key);
  }, []);

  const addDiff = useCallback((path: string, before: string, after: string) => {
    const entry: DiffEntry = {
      id: crypto.randomUUID(),
      path,
      before,
      after,
      timestamp: Date.now(),
      reverted: false,
    };
    setDiffs((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const revertDiff = useCallback((id: string) => {
    setDiffs((prev) => {
      const entry = prev.find((d) => d.id === id);
      if (!entry || entry.reverted) return prev;
      // Revert the file
      setFilesState((f) => {
        const next = { ...f, [entry.path]: entry.before };
        saveFiles(next);
        return next;
      });
      return prev.map((d) => (d.id === id ? { ...d, reverted: true } : d));
    });
  }, []);

  return {
    files,
    openTabs,
    activeTab,
    chatMessages,
    setChatMessages,
    diffs,
    apiKey,
    setApiKey,
    setFiles,
    updateFile,
    openFile,
    closeTab,
    setActiveTab,
    importFiles,
    clearAll,
    addDiff,
    revertDiff,
    createFile,
    deleteFile,
    filesRef,
  };
}
