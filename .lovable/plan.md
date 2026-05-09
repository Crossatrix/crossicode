## Goals

Fix three issues with the AI chat:
1. Large file edits get truncated by the response token limit.
2. Some models emit `<longcat_tool_call>...</longcat_tool_call>` instead of `[/( ... )]`, so tool calls aren't executed.
3. No way to choose which model is used.

## Changes

### 1. Remove the message length limit for large edits
**`src/lib/ai-chat.functions.ts`**
- Raise `max_tokens` from 4096 to 32000 (or omit it so the provider default applies).
- Accept an optional `model` field in the input schema; if present, use it instead of the hardcoded fallback list.

**`src/components/ChatPanel.tsx` — continuation loop**
- After each assistant reply, detect a *truncated* tool call: the response contains `[/( edit ...` or `[/( create ...` with no matching `)]` closing it.
- When detected, automatically send a follow-up turn with a short user message like "continue the previous tool call from exactly where you stopped, do not repeat anything, end with `)]`" and append the new chunk to the previous assistant message before parsing.
- Loop until the call closes or a max-continuation count (e.g. 5) is hit. This lets the AI emit very large file contents across multiple turns transparently.

### 2. Recognize alternative tool-call syntaxes
**`src/components/ChatPanel.tsx`**
- Extend `parseToolCalls` and `stripToolCalls` to also match:
  - `<longcat_tool_call>NAME args...</longcat_tool_call>` (and similar `<tool_call>` variants), parsing the inner text as `tool args`.
- Strengthen the system prompt to insist on `[/( ... )]`, but fall back gracefully when the model ignores it.

### 3. Model selector in Settings
**`src/hooks/use-editor-store.ts`**
- Add `model` state persisted to `localStorage` (`code-editor-model`), default `"baidu/cobuddy:free"`. Expose `model` and `setModel`.

**`src/components/ChatPanel.tsx`**
- Add a model `<select>` (with a few preset OpenRouter options) plus a free-text input for custom model IDs in the Settings panel.
- Pass the chosen model to `chatWithAI({ data: { ..., model } })`.

**`src/routes/index.tsx`**
- Wire `store.model` / `store.setModel` into `<ChatPanel />` props.

## Technical notes

- Truncation detector: count unclosed `[/(` occurrences vs `)]` occurrences; if positive, treat as truncated.
- Continuation merging: when the AI responds again, concatenate its `content` to the prior assistant message in `conversationHistory` so `parseToolCalls` sees the full call, then process tools as today.
- Model preset list (initial): `baidu/cobuddy:free`, `openrouter/owl-alpha`, `google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.3-70b-instruct:free`. User can type any other ID.
- No backend/database changes; everything stays client-side + the existing server function.