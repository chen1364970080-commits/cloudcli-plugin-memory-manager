# Memory Manager Plugin

CloudCLI UI plugin that browses Claude Code memory entries from ~/.claude/projects/*/memory/.

## Build

```bash
npm install
npm run build
```

## Files

- `src/server.ts` — HTTP backend, scans memory directories and parses MEMORY.md index
- `src/index.ts` — Frontend UI, polls server every 5s, 3-level navigation
- `src/types.ts` — PluginAPI type definitions
- `dist/` — Compiled TypeScript output
