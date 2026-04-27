# CloudCLI Plugin: Memory Manager

A sidebar tab plugin for [Claude Code](https://claude.ai/code) for browsing and reading Claude Code memory entries organized by project.

## What It Does

Claude Code maintains per-project memory in `~/.claude/projects/<project>/memory/`. This plugin scans those directories, parses the `MEMORY.md` index file, and presents all memory entries in a navigable panel with three levels of depth:

1. **Project list** — all projects that have memory entries
2. **Entry list** — all entries within a project (user / feedback / project / reference / unknown)
3. **Entry detail** — full content of a memory file with markdown rendering

## Features

- **Three-level navigation** — project list → entry list → entry detail, with breadcrumb back navigation
- **Memory type badges** — color-coded by type (user / feedback / project / reference / unknown)
- **Rich metadata** — last modified time, file size, description snippet
- **Markdown rendering** — renders `.md` memory files with heading hierarchy, horizontal rules, and paragraph spacing
- **Unindexed files** — also shows memory files not listed in `MEMORY.md` (by scanning the directory directly)
- **Dark + light themes** — automatic theme switching based on Claude Code's theme

## Architecture

```
memory-manager/
├── manifest.json       # Plugin descriptor (name, entry, server, slot)
├── src/
│   ├── server.ts       # Backend HTTP server (Node.js)
│   │                    # Scans ~/.claude/projects/*/memory/
│   │                    # Parses MEMORY.md index + raw .md files
│   ├── index.ts        # Frontend (vanilla JS, manual refresh)
│   └── types.ts        # PluginAPI / PluginContext type definitions
├── dist/               # Compiled output (tsc)
├── icon.svg            # Plugin icon
├── package.json
└── tsconfig.json
```

## How the Backend Works

The server walks `~/.claude/projects/` and for each subdirectory checks for a `memory/` folder:

**Index parsing** — `MEMORY.md` uses a Markdown link list format:
```markdown
- [entry-name](filename.md) — description here
- [user-memory](user_memory.md)
```

**Unindexed files** — files in the memory directory that aren't listed in `MEMORY.md` are also included, with description inferred from the first non-heading line of the file.

**Type inference** — type is inferred from filename and description keywords:
- `feedback` → feedback entries
- `project` → project entries
- `reference` → reference entries
- `user` → user entries
- otherwise → `unknown`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memory` | GET | List all projects and their memory entries |
| `/memory/entry/:project/:file` | GET | Get full content of a memory entry |
| `/health` | GET | Server health check |

### Response: `/memory`

```json
{
  "projects": [
    {
      "projectPath": "/home/user/.claude/projects/my-project",
      "projectName": "my-project",
      "entries": [
        {
          "name": "coding-style",
          "file": "coding-style.md",
          "description": "Immutability and clean code standards",
          "type": "project",
          "lastModified": 1745712000000,
          "size": 2048
        }
      ],
      "indexLastModified": 1745712000000
    }
  ],
  "totalEntries": 12
}
```

### Response: `/memory/entry/:project/:file`

```json
{
  "entry": {
    "name": "coding-style",
    "file": "coding-style.md",
    "type": "project",
    "lastModified": 1745712000000,
    "size": 2048
  },
  "content": "# Coding Style\n\nImmutability first...",
  "projectName": "my-project"
}
```

## Installation

```bash
# 1. Clone or copy the plugin
git clone https://github.com/chen1364970080-commits/cloudcli-plugin-memory-manager.git

# 2. Install into Claude Code plugins directory
cp -r cloudcli-plugin-memory-manager ~/.claude-code-ui/plugins/memory-manager

# 3. Build
cd ~/.claude-code-ui/plugins/memory-manager
npm install
npm run build

# 4. Restart Claude Code — the "Memory" tab appears in the sidebar
```

## Requirements

- Claude Code with plugin support (UI v2+)
- Node.js (the backend server uses native Node APIs)
- Memory entries in `~/.claude/projects/*/memory/`

## Plugin API

This plugin uses the CloudCLI Plugin API:

```typescript
interface PluginContext {
  theme: 'dark' | 'light';
  project: { name: string; path: string } | null;
  session: { id: string; title: string } | null;
}

interface PluginAPI {
  readonly context: PluginContext;
  onContextChange(callback: (ctx: PluginContext) => void): () => void;
  rpc(method: string, path: string, body?: unknown): Promise<unknown>;
}

mount(container: HTMLElement, api: PluginAPI): void;
unmount(container: HTMLElement): void;
```

## Key Design Decisions

- **No framework** — vanilla JS + CSS for the frontend. No React/Vue/Svelte dependency.
- **Manual refresh** — no automatic polling. Click the ↻ button to refresh. This avoids disrupting navigation when viewing entry details.
- **View state on container** — navigation state is stored on the container element rather than component-local state. This means switching between sidebar tabs and back preserves your position in the memory hierarchy.
- **Scroll preservation** — saves/restores `scrollTop` across re-renders so users don't jump to the top on refresh.
- **Theme-aware** — reads `ctx.theme` from the plugin API and applies the appropriate color palette.
- **Markdown rendering** — the detail view does lightweight markdown parsing: `# / ## / ### headings`, `---` horizontal rules, and blank lines get spacing. No external markdown library.

## License

MIT
