import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Settings, Trash2, Bot, User, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { chatWithAI } from "../lib/ai-chat.functions";
import { getFilePaths } from "../lib/file-system";
import type { ChatMessage, DiffEntry } from "../hooks/use-editor-store";

interface ChatPanelProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  files: Record<string, string>;
  filesRef: React.MutableRefObject<Record<string, string>>;
  apiKey: string;
  setApiKey: (key: string) => void;
  model: string;
  setModel: (m: string) => void;
  onFileRead: (path: string) => string | undefined;
  onFileEdit: (path: string, content: string) => void;
  onFileCreate: (path: string, content?: string) => void;
  onFileDelete: (path: string) => void;
  diffs: DiffEntry[];
  onRevertDiff: (id: string) => void;
}

const MODEL_PRESETS = [
  "baidu/cobuddy:free",
  "openrouter/owl-alpha",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3.1:free",
  "qwen/qwen3-coder:free",
];

const TOOL_NAMES = "read|edit|create|delete|search";
const BRACKET_RE = new RegExp(`\\[\\/\\(\\s*(${TOOL_NAMES})\\s+([\\s\\S]*?)\\s*\\)\\]`, "g");
const XML_RE = new RegExp(`<(?:longcat_)?tool_call>\\s*(${TOOL_NAMES})\\s+([\\s\\S]*?)\\s*<\\/(?:longcat_)?tool_call>`, "g");

function parseToolCalls(content: string): Array<{ tool: string; args: string }> {
  const calls: Array<{ tool: string; args: string }> = [];
  let m;
  const b = new RegExp(BRACKET_RE.source, "g");
  while ((m = b.exec(content)) !== null) calls.push({ tool: m[1], args: m[2] });
  const x = new RegExp(XML_RE.source, "g");
  while ((m = x.exec(content)) !== null) calls.push({ tool: m[1], args: m[2] });
  return calls;
}

function stripToolCalls(content: string): string {
  return content
    .replace(new RegExp(BRACKET_RE.source, "g"), "")
    .replace(new RegExp(XML_RE.source, "g"), "")
    .trim();
}

function hasUnclosedToolCall(content: string): boolean {
  const stripped = content
    .replace(new RegExp(BRACKET_RE.source, "g"), "")
    .replace(new RegExp(XML_RE.source, "g"), "");
  if (/\[\/\(\s*(?:read|edit|create|delete|search)\b/.test(stripped)) return true;
  if (/<(?:longcat_)?tool_call>\s*(?:read|edit|create|delete|search)\b/.test(stripped)) return true;
  return false;
}

function getToolSummary(tool: string, args: string): string {
  const firstLine = args.split("\n")[0].trim();
  return `${tool} ${firstLine}`;
}

function ToolCallsBadge({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const calls = parseToolCalls(content);
  if (calls.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {calls.length} tool call{calls.length > 1 ? "s" : ""}
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 text-[10px] text-muted-foreground bg-[#11111b] rounded p-2 max-h-40 overflow-y-auto">
          {calls.map((c, i) => (
            <div key={i} className="font-mono">
              <span className="text-yellow-400">{c.tool}</span>{" "}
              <span className="text-blue-300">{c.args.split("\n")[0].trim()}</span>
              {c.tool !== "read" && c.tool !== "delete" && c.args.includes("\n") && (
                <span className="text-muted-foreground/50"> ({c.args.split("\n").length - 1} lines)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  messages,
  setMessages,
  files,
  filesRef,
  apiKey,
  setApiKey,
  model,
  setModel,
  onFileRead,
  onFileEdit,
  onFileCreate,
  onFileDelete,
  diffs,
  onRevertDiff,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiffs, setShowDiffs] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const getSystemPrompt = useCallback(() => {
    const paths = getFilePaths(filesRef.current);
    return `You are an AI code assistant. The user has uploaded a project with the following files:

${paths.map((p) => `- ${p}`).join("\n")}

You can use tools to interact with files. Give a SHORT answer explaining what you're doing, then include tool calls inline. You can use MULTIPLE tool calls in a single response.

TOOL SYNTAX (copy exactly):
[/( read src/example.ts )]
[/( edit src/example.ts
new file content here
)]
[/( create src/newfile.ts
file content here
)]
[/( delete src/example.ts )]
[/( search TODO )]

CRITICAL: Every tool call MUST end with )] — a closing parenthesis and closing bracket. If you omit )] the tool will NOT execute.

You can chain multiple tool calls in one message. For example, read two files at once:
[/( read src/a.ts )]
[/( read src/b.ts )]

Keep your responses brief. Explain in 1-2 sentences what you'll do, then use the tools. Do NOT ramble. When editing or creating, provide the COMPLETE file content.`;
  }, [filesRef]);

  const processToolCalls = useCallback(
    async (content: string): Promise<string | null> => {
      const calls = parseToolCalls(content);
      if (calls.length === 0) return null;

      const results: string[] = [];
      for (const call of calls) {
        try {
          if (call.tool === "read") {
            const path = call.args.trim();
            const fileContent = onFileRead(path);
            if (fileContent !== undefined) {
              results.push(`File \`${path}\`:\n\`\`\`\n${fileContent}\n\`\`\``);
            } else {
              results.push(`File \`${path}\` not found.`);
            }
          } else if (call.tool === "edit") {
            const firstNewline = call.args.indexOf("\n");
            if (firstNewline === -1) {
              results.push(`Edit failed: no content provided for edit.`);
            } else {
              const path = call.args.substring(0, firstNewline).trim();
              const newContent = call.args.substring(firstNewline + 1);
              onFileEdit(path, newContent);
              results.push(`File \`${path}\` has been updated.`);
            }
          } else if (call.tool === "create") {
            const firstNewline = call.args.indexOf("\n");
            if (firstNewline === -1) {
              const path = call.args.trim();
              onFileCreate(path, "");
              results.push(`File \`${path}\` has been created.`);
            } else {
              const path = call.args.substring(0, firstNewline).trim();
              const newContent = call.args.substring(firstNewline + 1);
              onFileCreate(path, newContent);
              results.push(`File \`${path}\` has been created.`);
            }
          } else if (call.tool === "delete") {
            const path = call.args.trim();
            onFileDelete(path);
            results.push(`File \`${path}\` has been deleted.`);
          } else if (call.tool === "search") {
            const query = call.args.trim();
            if (!query) {
              results.push(`Search failed: empty query.`);
            } else {
              const lower = query.toLowerCase();
              const hits: string[] = [];
              let total = 0;
              for (const [path, content] of Object.entries(filesRef.current)) {
                const lines = content.split("\n");
                const matches: string[] = [];
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].toLowerCase().includes(lower)) {
                    matches.push(`  ${i + 1}: ${lines[i].trim().slice(0, 200)}`);
                    total++;
                    if (total > 100) break;
                  }
                }
                if (matches.length > 0) hits.push(`${path}\n${matches.join("\n")}`);
                if (total > 100) break;
              }
              results.push(
                hits.length === 0
                  ? `No matches for \`${query}\`.`
                  : `Search \`${query}\` — ${total} matches:\n${hits.join("\n\n")}`
              );
            }
          }
        } catch (err) {
          results.push(`Tool \`${call.tool}\` failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      return results.join("\n\n");
    },
    [onFileRead, onFileEdit, onFileCreate, onFileDelete, filesRef]
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !apiKey.trim()) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const systemMsg: ChatMessage = { role: "system", content: getSystemPrompt() };
      let conversationHistory = [...newMessages];
      const MAX_TOOL_LOOPS = 10;

      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        const apiMessages = [systemMsg, ...conversationHistory];
        let result = await chatWithAI({ data: { messages: apiMessages, apiKey, model } });

        if (result.error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${result.error}` },
          ]);
          return;
        }

        let assistantContent = result.content;

        // Auto-continue if response was truncated mid tool-call
        const MAX_CONT = 5;
        for (let c = 0; c < MAX_CONT; c++) {
          const truncated =
            result.finishReason === "length" || hasUnclosedToolCall(assistantContent);
          if (!truncated) break;
          const contMessages: ChatMessage[] = [
            systemMsg,
            ...conversationHistory,
            { role: "assistant", content: assistantContent },
            {
              role: "user",
              content:
                "Your previous message was cut off. Continue from EXACTLY where you stopped — do not repeat any text, do not add explanations, just output the remaining characters and make sure to close the tool call with )] (or </longcat_tool_call>).",
            },
          ];
          result = await chatWithAI({ data: { messages: contMessages, apiKey, model } });
          if (result.error || !result.content) break;
          assistantContent += result.content;
        }

        const assistantMsg: ChatMessage = { role: "assistant", content: assistantContent };
        conversationHistory = [...conversationHistory, assistantMsg];
        setMessages([...conversationHistory]);

        const toolResult = await processToolCalls(assistantContent);
        if (!toolResult) break;

        const toolMsg: ChatMessage = { role: "user", content: `Tool results:\n${toolResult}` };
        conversationHistory = [...conversationHistory, toolMsg];
        setMessages([...conversationHistory]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, apiKey, model, messages, setMessages, getSystemPrompt, processToolCalls]);

  return (
    <div className="flex flex-col h-full bg-[#181825] text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">AI Assistant</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setShowDiffs(!showDiffs)}
            className="p-1.5 hover:bg-accent/50 rounded text-xs text-muted-foreground"
            title="Diff history"
          >
            Diffs
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 hover:bg-accent/50 rounded"
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setMessages([])}
            className="p-1.5 hover:bg-accent/50 rounded"
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-[#313244] bg-[#11111b]">
          <label className="text-xs text-muted-foreground block mb-1">OpenRouter API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-..."
            className="w-full text-xs bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Models: baidu/cobuddy:free → openrouter/owl-alpha (fallback)
          </p>
        </div>
      )}

      {/* Diffs */}
      {showDiffs && (
        <div className="px-3 py-2 border-b border-[#313244] bg-[#11111b] max-h-48 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-2">Edit History</p>
          {diffs.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">No edits yet</p>
          ) : (
            diffs.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-1 text-xs border-b border-[#313244] last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="text-blue-400 truncate block">{d.path}</span>
                  <span className="text-muted-foreground/60">
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {d.reverted ? (
                  <span className="text-yellow-500 text-[10px]">reverted</span>
                ) : (
                  <button
                    onClick={() => onRevertDiff(d.id)}
                    className="text-red-400 hover:text-red-300 text-[10px] shrink-0 ml-2"
                  >
                    undo
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground/60 text-sm mt-8 space-y-2">
            <Bot className="h-8 w-8 mx-auto opacity-40" />
            <p>Upload a project and ask questions about your code.</p>
            <p className="text-xs">Set your OpenRouter API key in settings ⚙️</p>
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((msg, i) => {
            const isAssistant = msg.role === "assistant";
            const hasTools = isAssistant && parseToolCalls(msg.content).length > 0;
            const displayContent = isAssistant ? stripToolCalls(msg.content) : msg.content;
            const isToolResult = msg.role === "user" && msg.content.startsWith("Tool results:");

            if (isToolResult) return null;

            return (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {isAssistant && (
                  <div className="shrink-0 mt-1">
                    <Bot className="h-5 w-5 text-blue-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-[#1e1e2e] text-foreground"
                  }`}
                >
                  {isAssistant ? (
                    <>
                      {displayContent && (
                        <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-[#11111b] [&_pre]:rounded [&_pre]:p-2 [&_code]:text-xs">
                          <ReactMarkdown>{displayContent}</ReactMarkdown>
                        </div>
                      )}
                      {hasTools && <ToolCallsBadge content={msg.content} />}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <User className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                )}
              </div>
            );
          })}
        {loading && (
          <div className="flex gap-2 items-center text-muted-foreground">
            <Bot className="h-5 w-5 text-blue-400" />
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-[#313244]">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={apiKey ? "Ask about your code..." : "Set API key first ⚙️"}
            disabled={!apiKey || loading}
            rows={2}
            className="flex-1 text-sm bg-[#1e1e2e] border border-[#313244] rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !apiKey || loading}
            className="self-end p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg transition-colors"
          >
            <Send className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
