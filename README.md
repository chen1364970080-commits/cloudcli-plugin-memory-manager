# CloudCLI Plugin: Memory Manager

A sidebar tab plugin for [Claude Code](https://claude.ai/code) for browsing and managing Claude Code memory entries organized by project.

## What It Does

Claude Code stores memory entries per project in `~/.claude/projects/<project>/memory/`. Each project has a `MEMORY.md` index file that lists all memory entries. This plugin scans all projects, parses the index, and presents memories in a searchable, navigable panel. Auto-refreshes every 5 seconds.

## Features

- **Project-level organization** — Browse memory by project
- **Entry type badges** — user / feedback / project / reference / unknown
- **Full content viewer** — Click any entry to read the full memory content
- **Auto-refresh** — Polls every 5 seconds, preserves scroll position
- **Dark + light themes** — Automatic theme switching

## Architecture

```
memory-manager/
├── manifest.json       # Plugin descriptor
├── src/
│   ├── server.ts       # Backend HTTP server — scans ~/.claude/projects/*/memory/
│   │                    # Parses MEMORY.md index and individual .md files
│   ├── index.ts        # Frontend (vanilla JS, polling every 5s)
│   └── types.ts        # PluginAPI type definitions
├── dist/               # Compiled output (tsc)
├── icon.svg
├── package.json
└── tsconfig.json
```

## How the Backend Works

The server walks `~/.claude/projects/*/memory/` directories:

```
~/.claude/projects/<project>/memory/
├── MEMORY.md           # Index file with links to entries
├── entry-name.md       # Individual memory entry files
└── another-entry.md
```

The `MEMORY.md` index follows this format:

```markdown
# Claude Code Memory Index

- [Entry Name](entry-name.md) — Description of the entry
- [Another Entry](another-entry.md) — Another description
```

Each `.md` file in the memory directory is a standalone memory entry.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memory` | GET | List all projects with memory and their entries |
| `/memory/entry/<project>/<file>` | GET | Read full content of a memory entry |
| `/health` | GET | Server health check |

### Response: `/memory`

```json
{
  "projects": [
    {
      "projectPath": "/path/to/projects/my-project",
      "projectName": "my-project",
      "entries": [
        {
          "name": "Entry Name",
          "file": "entry-name.md",
          "description": "Description of the entry",
          "type": "feedback",
          "lastModified": 1745712000000,
          "size": 512
        }
      ],
      "indexLastModified": 1745712000000
    }
  ],
  "totalEntries": 10
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

## Key Design Decisions

- **No framework** — vanilla JS + CSS for the frontend.
- **Poll-based** — 5-second polling interval.
- **Three-level navigation** — Project list → Entry list → Full content view.
- **Scroll preservation** — saves/restores `scrollTop` across re-renders.

## License

MIT
