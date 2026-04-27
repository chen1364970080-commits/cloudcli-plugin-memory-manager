import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
function getMtime(p) {
    try {
        return fs.statSync(p).mtimeMs;
    }
    catch {
        return 0;
    }
}
function inferType(filename, description) {
    const lower = (filename + ' ' + description).toLowerCase();
    if (lower.includes('feedback'))
        return 'feedback';
    if (lower.includes('project'))
        return 'project';
    if (lower.includes('reference'))
        return 'reference';
    if (lower.includes('user') || lower.includes('用户'))
        return 'user';
    return 'unknown';
}
function parseMemFilename(filename) {
    return filename.replace(/\.md$/, '');
}
function parseMemoryIndex(content, dirPath) {
    const entries = [];
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const match = trimmed.match(/^-\s*\[([^\]]+)\]\(([^)]+\.md)\)(?:\s*[---]\s*(.*))?/);
        if (match) {
            const [, title, mdFile, description = ''] = match;
            const filePath = path.join(dirPath, mdFile);
            let stat = null;
            try {
                stat = fs.statSync(filePath);
            }
            catch { /* ignore */ }
            entries.push({
                name: title.trim(),
                file: mdFile,
                description: description.trim(),
                type: inferType(mdFile, description),
                lastModified: stat?.mtimeMs ?? 0,
                size: stat?.size ?? 0,
            });
        }
    }
    return entries;
}
function getMemoryData() {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const projects = [];
    let projectDirs = [];
    try {
        projectDirs = fs.readdirSync(projectsDir);
    }
    catch { /* ignore */ }
    let totalEntries = 0;
    for (const dir of projectDirs) {
        const memDir = path.join(projectsDir, dir, 'memory');
        let memDirStat;
        try {
            memDirStat = fs.statSync(memDir);
        }
        catch {
            continue;
        }
        if (!memDirStat.isDirectory())
            continue;
        const indexPath = path.join(memDir, 'MEMORY.md');
        let entries = [];
        let indexLastModified = getMtime(memDir);
        try {
            const content = fs.readFileSync(indexPath, 'utf-8');
            entries = parseMemoryIndex(content, memDir);
        }
        catch { /* no index */ }
        const files = fs.readdirSync(memDir);
        const indexedFiles = new Set(entries.map((e) => e.file));
        for (const file of files) {
            if (file === 'MEMORY.md' || !file.endsWith('.md') || indexedFiles.has(file))
                continue;
            const filePath = path.join(memDir, file);
            let stat = null;
            try {
                stat = fs.statSync(filePath);
            }
            catch {
                continue;
            }
            if (!stat.isFile())
                continue;
            let desc = '';
            try {
                const c = fs.readFileSync(filePath, 'utf-8');
                const firstLine = c.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'));
                if (firstLine) {
                    desc = firstLine.replace(/^#+\s*/, '').trim().slice(0, 120);
                }
            }
            catch { /* ignore */ }
            entries.push({
                name: parseMemFilename(file),
                file,
                description: desc,
                type: inferType(file, desc),
                lastModified: stat.mtimeMs,
                size: stat.size,
            });
        }
        if (entries.length === 0)
            continue;
        projects.push({
            projectPath: path.join(projectsDir, dir),
            projectName: dir,
            entries,
            indexLastModified,
        });
        totalEntries += entries.length;
    }
    return { projects, totalEntries };
}
function getEntryContent(projectName, file) {
    const baseDir = path.join(os.homedir(), '.claude', 'projects', projectName, 'memory');
    const filePath = path.join(baseDir, file);
    try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        return {
            entry: {
                name: parseMemFilename(file),
                file,
                description: '',
                type: inferType(file, ''),
                lastModified: stat.mtimeMs,
                size: stat.size,
            },
            content,
            projectName,
        };
    }
    catch {
        return null;
    }
}
const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url) {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/memory' || url.pathname === '/memory/') {
            try {
                res.end(JSON.stringify(getMemoryData()));
            }
            catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }
        if (url.pathname.startsWith('/memory/entry/')) {
            const parts = url.pathname.replace('/memory/entry/', '').split('/');
            if (parts.length >= 2) {
                const [projName, ...rest] = parts;
                const file = decodeURIComponent(rest.join('/'));
                const result = getEntryContent(projName, file);
                if (result) {
                    res.end(JSON.stringify(result));
                }
                else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Entry not found' }));
                }
                return;
            }
        }
        if (url.pathname === '/health') {
            res.end(JSON.stringify({ ok: true }));
            return;
        }
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});
server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    if (addr && typeof addr !== 'string') {
        console.log(JSON.stringify({ ready: true, port: addr.port }));
    }
});
//# sourceMappingURL=server.js.map