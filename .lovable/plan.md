
# AI Code Editor

A browser-based code editing environment where you upload a zip of your project, browse and edit files, and chat with an AI that can read and modify your code. Everything is stored in localStorage — no login required.

## Layout

Split-view with three panels:
1. **File tree sidebar** (left) — collapsible, shows all files from the uploaded zip
2. **Code editor** (center) — tabbed editor with syntax highlighting, shows the currently selected file
3. **AI chat panel** (right) — conversation with the AI assistant, collapsible

Dark theme throughout, VS Code-inspired aesthetic.

## Features

### Zip Upload
- Upload a .zip file via a drop zone or button on the home screen
- Extracts all files into an in-memory file system stored in localStorage
- File tree updates to show the project structure (folders and files)
- Can re-upload or clear the project at any time

### Code Editor
- Syntax-highlighted editor using CodeMirror
- Tabbed interface for multiple open files
- Edit and save files (persisted to localStorage)
- File tree click opens file in a new tab

### AI Chat
- Chat panel beside the editor with message history (stored in localStorage)
- Sends messages to OpenRouter API (model: `baidu/cobuddy:free`, fallback: `openrouter/owl-alpha`)
- User provides their OpenRouter API key via a settings input (stored in localStorage)
- On project load, AI receives a system prompt with the full file tree (paths and filenames)

### AI Tool Use
- The AI can use tools in its responses using the format `[/( <tool> )\]`
- **read \<path\>** — AI requests to read a file; the app automatically sends the file content back to the AI
- **edit \<path\> \<new file content\>** — AI proposes a file edit
- When AI edits a file: changes auto-apply with a toast notification, and a diff history is kept so you can view what changed and undo edits

### Diff History
- Each AI edit creates a history entry showing before/after
- View diff in a modal with accept (already applied) or revert option
- Undo reverts the file to its previous state

## Technical Details

- **CodeMirror 6** for the editor (syntax highlighting for common languages)
- **JSZip** for zip extraction in the browser
- **OpenRouter API** called via a server function (to keep the API key secure) with fallback model logic
- **localStorage** for all persistence: files, chat history, open tabs, API key
- **react-diff-viewer** or similar for diff display
