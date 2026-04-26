/**
 * Memory Manager plugin — frontend entry point.
 *
 * Displays Claude Code memory entries organized by project.
 * Polls the backend server every 5 seconds for updates.
 */

import type { PluginAPI, PluginContext } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────

interface MemoryEntry {
  name: string;
  file: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference' | 'unknown';
  lastModified: number;
  size: number;
}

interface ProjectMemory {
  projectPath: string;
  projectName: string;
  entries: MemoryEntry[];
  indexLastModified: number;
}

interface MemoryResponse {
  projects: ProjectMemory[];
  totalEntries: number;
}

interface EntryResponse {
  entry: MemoryEntry;
  content: string;
  projectName: string;
}

// ── Theme ─────────────────────────────────────────────────────────────

interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  mono: string;
  user: string;
  feedback: string;
  project: string;
  reference: string;
  unknown: string;
}

const MONO = "'JetBrains Mono', 'Fira Code', ui-monospace, monospace";

function themeColors(dark: boolean): ThemeColors {
  return dark
    ? {
        bg: '#08080f',
        surface: '#0e0e1a',
        surface2: '#13131f',
        border: '#1a1a2c',
        text: '#e2e0f0',
        muted: '#52507a',
        accent: '#fbbf24',
        mono: MONO,
        user: '#a78bfa',
        feedback: '#f472b6',
        project: '#60a5fa',
        reference: '#34d399',
        unknown: '#9ca3af',
      }
    : {
        bg: '#fafaf9',
        surface: '#ffffff',
        surface2: '#f4f3ef',
        border: '#e8e6f0',
        text: '#0f0e1a',
        muted: '#9490b0',
        accent: '#d97706',
        mono: MONO,
        user: '#7c3aed',
        feedback: '#db2777',
        project: '#2563eb',
        reference: '#059669',
        unknown: '#6b7280',
      };
}

// ── Helpers ────────────────────────────────────────────────────────────

function ago(ms: number): string {
  if (!ms) return 'unknown';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 2592000)}mo ago`;
}

function truncate(str: string, max = 100): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function typeBadge(type: MemoryEntry['type'], c: ThemeColors): string {
  const color = c[type] ?? c.unknown;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return `<span style="
    display:inline-block;font-size:0.55rem;font-weight:600;
    padding:2px 6px;border-radius:3px;
    background:${color}18;color:${color};
    border:1px solid ${color}44;
    letter-spacing:0.05em;text-transform:uppercase;
  ">${label}</span>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

// ── Styles ─────────────────────────────────────────────────────────────

function ensureStyles(): void {
  if (document.getElementById('mm-styles')) return;
  const s = document.createElement('style');
  s.id = 'mm-styles';
  s.textContent = `
    @keyframes mm-fadeup {
      from { opacity:0; transform:translateY(6px) }
      to   { opacity:1; transform:translateY(0) }
    }
    @keyframes mm-pulse {
      0%,100% { opacity:0.25 }
      50%      { opacity:0.5 }
    }
    @keyframes mm-spin {
      to { transform:rotate(360deg) }
    }
    .mm-up { animation: mm-fadeup 0.3s ease both }
    .mm-back-btn {
      background:none;border:none;cursor:pointer;
      font-family:${MONO};font-size:0.72rem;
      display:flex;align-items:center;gap:6px;
      padding:6px 0;margin-bottom:8px;
    }
  `;
  document.head.appendChild(s);
}

// ── Render ─────────────────────────────────────────────────────────────

type View = { kind: 'list' } | { kind: 'project'; project: ProjectMemory } | { kind: 'entry'; project: ProjectMemory; entry: MemoryEntry; content: string };

function render(
  root: HTMLElement,
  ctx: PluginContext,
  data: MemoryResponse | null,
  loading: boolean,
  error: string | null,
  view: View
): void {
  const c = themeColors(ctx.theme === 'dark');
  root.style.background = c.bg;
  root.style.color = c.text;
  root.style.fontFamily = MONO;

  const contentEl = root.querySelector('#mm-content');
  const savedScrollTop = contentEl ? (contentEl as HTMLElement).scrollTop : root.scrollTop;

  root.innerHTML = renderRoot(c, data, loading, error, view);

  // Wire back button
  const backBtn = root.querySelector('#mm-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (view.kind === 'entry') {
        (root as any)._mmView = { kind: 'project', project: view.project };
        render(root, ctx, data, false, null, (root as any)._mmView);
      } else if (view.kind === 'project') {
        (root as any)._mmView = { kind: 'list' };
        render(root, ctx, data, false, null, (root as any)._mmView);
      }
    });
  }

  // Wire entry clicks
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-project][data-file]'))) {
    el.addEventListener('click', () => {
      const projectName = el.dataset.project!;
      const file = el.dataset.file!;
      const project = data?.projects.find((p) => p.projectName === projectName);
      if (!project) return;
      const entry = project.entries.find((e) => e.file === file);
      if (!entry) return;
      loadEntry(root, ctx, data, project, entry);
    });
  }

  // Wire project clicks
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-project-name]'))) {
    el.addEventListener('click', () => {
      const projectName = el.dataset.projectName!;
      const project = data?.projects.find((p) => p.projectName === projectName);
      if (!project) return;
      (root as any)._mmView = { kind: 'project', project };
      render(root, ctx, data, false, null, (root as any)._mmView);
    });
  }

  // Restore scroll
  const newContent = root.querySelector('#mm-content');
  if (newContent) (newContent as HTMLElement).scrollTop = savedScrollTop;
}

function renderRoot(c: ThemeColors, data: MemoryResponse | null, loading: boolean, error: string | null, view: View): string {
  const total = data?.totalEntries ?? 0;

  let headerTitle = 'Memory';
  if (view.kind === 'project') headerTitle = view.project.projectName;
  if (view.kind === 'entry') headerTitle = view.entry.name;

  let breadcrumb = '';
  if (view.kind === 'entry') {
    breadcrumb = `
      <button id="mm-back-btn" class="mm-back-btn" style="color:${c.muted}">
        <span style="font-size:0.8rem">←</span> ${escHtml(view.project.projectName)}
      </button>`;
  } else if (view.kind === 'project') {
    breadcrumb = `
      <button id="mm-back-btn" class="mm-back-btn" style="color:${c.muted}">
        <span style="font-size:0.8rem">←</span> All Projects
      </button>`;
  }

  let contentHtml = `<div id="mm-content" style="flex:1;overflow-y:auto;padding:0 20px 16px">`;

  if (error) {
    contentHtml += `<div style="padding:20px;font-size:0.75rem;color:#f43f5e">✗ ${escHtml(error)}</div>`;
  } else if (loading && !data) {
    for (const w of [55, 40, 65, 35]) {
      contentHtml += `
        <div style="background:${c.surface};border:1px solid ${c.border};border-radius:6px;padding:14px;margin-top:8px">
          <div style="height:10px;background:${c.muted};border-radius:2px;opacity:0.2;width:${w}%;margin-bottom:8px;animation:mm-pulse 1.6s ease infinite"></div>
          <div style="height:8px;background:${c.muted};border-radius:2px;opacity:0.12;width:${Math.max(20, w - 25)}%;animation:mm-pulse 1.6s ease infinite;animation-delay:0.1s"></div>
        </div>`;
    }
  } else if (view.kind === 'entry') {
    const lines = view.content.split('\n');
    contentHtml += `<div style="font-size:0.72rem;line-height:1.6;color:${c.text};opacity:0.85;padding-top:8px;white-space:pre-wrap;word-break:break-word">`;
    for (const line of lines) {
      const esc = escHtml(line);
      if (line.startsWith('# ')) {
        contentHtml += `<div style="font-size:0.9rem;font-weight:700;margin:16px 0 6px;opacity:1">${esc}</div>`;
      } else if (line.startsWith('## ')) {
        contentHtml += `<div style="font-size:0.82rem;font-weight:600;margin:12px 0 4px;opacity:0.9">${esc}</div>`;
      } else if (line.startsWith('#')) {
        contentHtml += `<div style="font-weight:500;opacity:0.8;margin:8px 0 2px">${esc}</div>`;
      } else if (line.trim() === '---') {
        contentHtml += `<hr style="border:none;border-top:1px solid ${c.border};margin:12px 0">`;
      } else if (line.trim() === '') {
        contentHtml += `<div style="height:6px"></div>`;
      } else {
        contentHtml += `<div>${esc}</div>`;
      }
    }
    contentHtml += `</div>`;
  } else if (view.kind === 'project') {
    contentHtml += `<div style="padding-top:8px;display:flex;flex-direction:column;gap:8px">`;
    for (let i = 0; i < view.project.entries.length; i++) {
      const e = view.project.entries[i];
      const delay = Math.min(i * 0.025, 0.4);
      contentHtml += `
        <div class="mm-up" data-project="${escHtml(view.project.projectName)}" data-file="${escHtml(e.file)}" style="
          background:${c.surface};border:1px solid ${c.border};
          border-radius:6px;padding:12px 14px;cursor:pointer;
          animation-delay:${delay}s;
          transition:border-color 0.15s;
        "
        onmouseover="this.style.borderColor='${c.accent}44'"
        onmouseout="this.style.borderColor='${c.border}'"
        >
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:0.8rem;font-weight:600">${escHtml(e.name)}</span>
              ${typeBadge(e.type, c)}
            </div>
            <span style="font-size:0.6rem;color:${c.muted}">${ago(e.lastModified)}</span>
          </div>
          ${e.description ? `<div style="font-size:0.68rem;color:${c.muted};line-height:1.4">${escHtml(truncate(e.description, 150))}</div>` : ''}
          <div style="font-size:0.58rem;color:${c.muted};opacity:0.5;margin-top:4px;font-family:${c.mono}">${escHtml(e.file)} · ${fmtSize(e.size)}</div>
        </div>`;
    }
    contentHtml += `</div>`;
  } else {
    // List view
    if (!data || data.projects.length === 0) {
      contentHtml += `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:50%;gap:10px;color:${c.muted};text-align:center">
          <div style="font-size:2rem;opacity:0.12">🧠</div>
          <div style="font-size:0.75rem;opacity:0.5">no memory entries found</div>
          <div style="font-size:0.65rem;opacity:0.3;max-width:260px;line-height:1.5">Memory entries are stored in ~/.claude/projects/&lt;project&gt;/memory/</div>
        </div>`;
    } else {
      for (let i = 0; i < data.projects.length; i++) {
        const proj = data.projects[i];
        const delay = Math.min(i * 0.04, 0.4);
        contentHtml += `
          <div class="mm-up" data-project-name="${escHtml(proj.projectName)}" style="
            background:${c.surface};border:1px solid ${c.border};
            border-radius:6px;padding:14px 16px;margin-top:10px;cursor:pointer;
            animation-delay:${delay}s;
            transition:border-color 0.15s;
          "
          onmouseover="this.style.borderColor='${c.accent}44'"
          onmouseout="this.style.borderColor='${c.border}'"
          >
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:0.9rem;font-weight:600">${escHtml(proj.projectName)}</span>
                <span style="font-size:0.6rem;color:${c.muted};padding:2px 6px;background:${c.bg};border:1px solid ${c.border};border-radius:3px">
                  ${proj.entries.length} ${proj.entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <span style="font-size:0.7rem;color:${c.muted}">→</span>
            </div>
            ${proj.entries.slice(0, 3).map((e) => `
              <div style="font-size:0.65rem;color:${c.muted};margin-top:4px;display:flex;align-items:center;gap:6px">
                ${typeBadge(e.type, c)}
                <span style="opacity:0.7">${escHtml(truncate(e.name, 50))}</span>
                ${e.description ? `<span style="opacity:0.4">— ${escHtml(truncate(e.description, 40))}</span>` : ''}
              </div>
            `).join('')}
            ${proj.entries.length > 3 ? `<div style="font-size:0.6rem;color:${c.muted};opacity:0.5;margin-top:6px">+${proj.entries.length - 3} more</div>` : ''}
          </div>`;
      }
    }
  }

  contentHtml += `</div>`;

  return `
    <div style="height:100%;display:flex;flex-direction:column;overflow:hidden">
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:16px 20px 12px;
        border-bottom:1px solid ${c.border};flex-shrink:0;
      ">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1rem;font-weight:700;letter-spacing:-0.02em">${headerTitle}</span>
          ${loading ? `<span style="
            display:inline-block;width:11px;height:11px;
            border:1.5px solid ${c.muted};border-top-color:${c.accent};
            border-radius:50%;animation:mm-spin 0.7s linear infinite;
          "></span>` : ''}
        </div>
        ${data ? `<div style="font-size:0.65rem;color:${c.muted}">${total} total · ${data.projects.length} projects</div>` : ''}
      </div>
      ${breadcrumb}
      ${contentHtml}
    </div>
  `;
}

async function loadEntry(
  root: HTMLElement,
  ctx: PluginContext,
  data: MemoryResponse | null,
  project: ProjectMemory,
  entry: MemoryEntry
): Promise<void> {
  try {
    const result = (await api.rpc('GET', `memory/entry/${encodeURIComponent(project.projectName)}/${encodeURIComponent(entry.file)}`)) as EntryResponse;
    (root as any)._mmView = { kind: 'entry', project, entry, content: result.content };
    render(root, ctx, data, false, null, (root as any)._mmView);
  } catch (err) {
    const c = themeColors(ctx.theme === 'dark');
    render(root, ctx, data, false, (err as Error).message, (root as any)._mmView ?? { kind: 'list' });
  }
}

// ── Mount / Unmount ────────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null;
let api: PluginAPI;

export function mount(container: HTMLElement, pluginApi: PluginAPI): void {
  ensureStyles();
  api = pluginApi;

  const root = document.createElement('div');
  Object.assign(root.style, { height: '100%', boxSizing: 'border-box', overflow: 'hidden' });
  container.appendChild(root);

  (root as any)._mmView = { kind: 'list' };

  let cached: MemoryResponse | null = null;
  let loading = false;
  let lastError: string | null = null;

  async function loadData(): Promise<void> {
    const ctx = api.context;
    loading = true;
    render(root, ctx, cached, loading, lastError, (root as any)._mmView ?? { kind: 'list' });

    try {
      const data = (await api.rpc('GET', 'memory')) as MemoryResponse;
      cached = data;
      lastError = null;
      render(root, ctx, data, false, null, (root as any)._mmView ?? { kind: 'list' });
    } catch (err) {
      lastError = (err as Error).message;
      render(root, ctx, cached, false, lastError, (root as any)._mmView ?? { kind: 'list' });
    } finally {
      loading = false;
    }
  }

  loadData();
  pollInterval = setInterval(loadData, 5000);

  const unsubscribe = api.onContextChange(() => {
    (root as any)._mmView = { kind: 'list' };
    loadData();
  });

  (container as any)._mmUnsubscribe = unsubscribe;
}

export function unmount(container: HTMLElement): void {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (typeof (container as any)._mmUnsubscribe === 'function') {
    (container as any)._mmUnsubscribe();
    delete (container as any)._mmUnsubscribe;
  }
  container.innerHTML = '';
}
