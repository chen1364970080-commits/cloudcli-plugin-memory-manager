# Memory Manager Plugin

CloudCLI UI plugin that browses Claude Code memory entries from ~/.claude/projects/*/memory/.

## Build

```bash
npm install
npm run build
```

## Files

- `src/server.ts` — HTTP backend, scans memory directories and parses MEMORY.md index
- `src/index.ts` — Frontend UI, manual refresh, view state persisted on container
- `src/types.ts` — PluginAPI type definitions
- `dist/` — Compiled TypeScript output
