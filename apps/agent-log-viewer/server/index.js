import express from 'express';
import { marked } from 'marked';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
const app = express();
const PORT = 4310;
const DEFAULT_ROOTS = ['C:\\work'];
const FRAMEWORK_FILE_CONFIG = [
    { key: 'agents', label: 'AGENTS.md', relativePath: 'AGENTS.md' },
    { key: 'spec', label: 'docs/spec.md', relativePath: 'docs/spec.md' },
    { key: 'architecture', label: 'docs/architecture.md', relativePath: 'docs/architecture.md' }
];
const COLUMN_ALIASES = {
    id: 'id',
    status: 'status',
    state: 'status',
    ownerzone: 'ownerZone',
    owner: 'ownerZone',
    zone: 'ownerZone',
    item: 'title',
    title: 'title',
    task: 'title',
    writescope: 'writeScope',
    scope: 'writeScope',
    dependson: 'dependsOn',
    dependencies: 'dependsOn',
    donewhen: 'doneWhen',
    acceptance: 'doneWhen',
    validation: 'validation',
    bosssignoff: 'bossSignoff',
    signoff: 'bossSignoff',
    notes: 'notes'
};
const watchSessions = new Map();
marked.setOptions({ gfm: true, breaks: true });
app.get('/api/projects', async (req, res) => {
    try {
        const roots = parseProjectRoots(req.query.roots);
        const projects = await loadProjects(roots);
        const payload = {
            roots,
            polledAt: new Date().toISOString(),
            projects
        };
        res.json(payload);
    }
    catch (error) {
        res.status(500).json({ error: toErrorMessage(error) });
    }
});
app.get('/api/projects/:projectId', async (req, res) => {
    try {
        const roots = parseProjectRoots(req.query.roots);
        const project = await findProjectById(req.params.projectId, roots);
        if (!project) {
            res.status(404).json({ error: 'Project not found.' });
            return;
        }
        const detail = await loadProjectDetail(project);
        res.json(detail);
    }
    catch (error) {
        res.status(500).json({ error: toErrorMessage(error) });
    }
});
app.get('/api/projects/:projectId/files/:fileKey', async (req, res) => {
    try {
        const roots = parseProjectRoots(req.query.roots);
        const project = await findProjectById(req.params.projectId, roots);
        if (!project) {
            res.status(404).json({ error: 'Project not found.' });
            return;
        }
        const content = await loadFrameworkFile(project, req.params.fileKey);
        if (!content) {
            res.status(404).json({ error: 'File not found.' });
            return;
        }
        res.json(content);
    }
    catch (error) {
        res.status(500).json({ error: toErrorMessage(error) });
    }
});
app.get('/api/events', (req, res) => {
    const roots = parseProjectRoots(req.query.roots);
    const session = getOrCreateWatchSession(roots);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    session.clients.add(res);
    writeEvent(res, 'connected', {
        roots,
        ts: new Date().toISOString(),
        watchStatus: getWatchStatus(session)
    });
    req.on('close', () => {
        session.clients.delete(res);
        if (session.clients.size === 0) {
            closeWatchSession(createRootsKey(roots));
        }
    });
});
app.listen(PORT, () => {
    console.log(`AgentLogViewer API listening on http://127.0.0.1:${PORT}`);
});
function parseProjectRoots(rawRoots) {
    if (typeof rawRoots !== 'string' || !rawRoots.trim()) {
        return DEFAULT_ROOTS;
    }
    return rawRoots
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function getOrCreateWatchSession(roots) {
    const key = createRootsKey(roots);
    const existing = watchSessions.get(key);
    if (existing) {
        return existing;
    }
    const session = {
        roots,
        clients: new Set(),
        watchers: [],
        debounceTimer: null,
        activeRoots: new Set(),
        unavailableRoots: new Set(),
        erroredRoots: new Set()
    };
    watchSessions.set(key, session);
    for (const root of roots) {
        if (!existsSync(root)) {
            session.unavailableRoots.add(root);
            continue;
        }
        try {
            const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
                const relativePath = typeof filename === 'string' ? filename.replace(/\\/g, '/') : '';
                if (!isRelevantWatchedPath(relativePath)) {
                    return;
                }
                notifyWatchSession(key, {
                    ts: new Date().toISOString(),
                    root,
                    path: relativePath,
                    kind: 'change'
                });
            });
            watcher.on('error', () => {
                session.activeRoots.delete(root);
                session.erroredRoots.add(root);
                notifyWatchSession(key, {
                    ts: new Date().toISOString(),
                    root,
                    path: null,
                    kind: 'watcher_error'
                });
            });
            session.activeRoots.add(root);
            session.unavailableRoots.delete(root);
            session.erroredRoots.delete(root);
            session.watchers.push(watcher);
        }
        catch {
            session.activeRoots.delete(root);
            session.unavailableRoots.add(root);
            notifyWatchSession(key, {
                ts: new Date().toISOString(),
                root,
                path: null,
                kind: 'watcher_unavailable'
            });
        }
    }
    return session;
}
function notifyWatchSession(key, payload) {
    const session = watchSessions.get(key);
    if (!session) {
        return;
    }
    if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
    }
    session.debounceTimer = setTimeout(() => {
        const watchStatus = getWatchStatus(session);
        for (const client of session.clients) {
            writeEvent(client, 'project-change', {
                ...payload,
                kind: payload.kind ?? 'change',
                watchStatus
            });
        }
        session.debounceTimer = null;
    }, 250);
}
function closeWatchSession(key) {
    const session = watchSessions.get(key);
    if (!session) {
        return;
    }
    if (session.debounceTimer) {
        clearTimeout(session.debounceTimer);
    }
    for (const watcher of session.watchers) {
        watcher.close();
    }
    watchSessions.delete(key);
}
function writeEvent(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
function createRootsKey(roots) {
    return roots.map((root) => root.toLowerCase()).sort().join('|');
}
function getWatchStatus(session) {
    return {
        roots: [...session.roots],
        activeRoots: [...session.activeRoots].sort(),
        unavailableRoots: [...session.unavailableRoots].sort(),
        erroredRoots: [...session.erroredRoots].sort(),
        isLive: session.activeRoots.size > 0 && session.unavailableRoots.size === 0 && session.erroredRoots.size === 0
    };
}
function isRelevantWatchedPath(relativePath) {
    if (!relativePath) {
        return true;
    }
    const normalized = relativePath.toLowerCase();
    return (normalized.includes('/docs/') ||
        normalized.endsWith('/agents.md') ||
        normalized.includes('/logs/') ||
        normalized.endsWith('/backlog.md'));
}
async function loadProjects(roots) {
    const candidates = await discoverProjects(roots);
    const details = await Promise.all(candidates.map(async (candidate) => {
        const backlogItems = await parseAllBacklogs(candidate);
        const logs = candidate.logsPath ? await loadProjectLogs(candidate.logsPath) : [];
        const latestChangedAt = await determineLatestChangedAt(candidate);
        return buildProjectSummary(candidate, backlogItems, logs, latestChangedAt);
    }));
    return details.sort((left, right) => {
        const leftTime = left.latestChangedAt ? Date.parse(left.latestChangedAt) : 0;
        const rightTime = right.latestChangedAt ? Date.parse(right.latestChangedAt) : 0;
        if (rightTime !== leftTime) {
            return rightTime - leftTime;
        }
        return left.name.localeCompare(right.name);
    });
}
async function findProjectById(projectId, roots) {
    const candidates = await discoverProjects(roots);
    return candidates.find((candidate) => candidate.id === projectId) ?? null;
}
async function loadProjectDetail(project) {
    const backlogItems = await parseAllBacklogs(project);
    const logs = project.logsPath ? await loadProjectLogs(project.logsPath) : [];
    const frameworkFiles = await loadFrameworkFiles(project);
    const latestChangedAt = await determineLatestChangedAt(project);
    const summary = buildProjectSummary(project, backlogItems, logs, latestChangedAt);
    return {
        project: summary,
        backlogItems,
        logs,
        frameworkFiles,
        backlogSources: project.backlogSources.map((source) => ({ key: source.key, label: source.label })),
        backlogZones: uniqueSorted(backlogItems.map((item) => item.ownerZone).filter(Boolean)),
        logZones: uniqueSorted(logs.map((entry) => entry.zone).filter(Boolean))
    };
}
async function discoverProjects(roots) {
    const allProjects = await Promise.all(roots.map(async (rootPath) => {
        try {
            const entries = await fs.readdir(rootPath, { withFileTypes: true });
            const candidates = await Promise.all(entries
                .filter((entry) => entry.isDirectory())
                .map(async (entry) => {
                const projectPath = path.join(rootPath, entry.name);
                const primaryBacklogPath = await findBacklogPath(projectPath);
                if (!primaryBacklogPath) {
                    return null;
                }
                const backlogSources = await collectBacklogSources(projectPath, primaryBacklogPath);
                const logsPath = existsSync(path.join(projectPath, 'logs'))
                    ? path.join(projectPath, 'logs')
                    : null;
                return {
                    id: createProjectId(projectPath),
                    name: entry.name,
                    rootPath,
                    projectPath,
                    primaryBacklogPath,
                    backlogSources,
                    logsPath
                };
            }));
            return candidates.filter(Boolean);
        }
        catch {
            return [];
        }
    }));
    return allProjects.flat();
}
function buildProjectSummary(project, backlogItems, logs, latestChangedAt) {
    const countsByStatus = createEmptyCounts();
    for (const item of backlogItems) {
        countsByStatus[item.status] += 1;
    }
    const latestLog = logs[0] ?? null;
    const blockedCount = countsByStatus.blocked;
    const inProgressCount = countsByStatus.in_progress;
    const attention = blockedCount > 0
        ? { tone: 'blocked', label: `${blockedCount} blocked item${blockedCount === 1 ? '' : 's'}` }
        : inProgressCount > 0
            ? { tone: 'active', label: `${inProgressCount} active item${inProgressCount === 1 ? '' : 's'}` }
            : { tone: 'quiet', label: 'No active blockers' };
    return {
        id: project.id,
        name: project.name,
        rootPath: project.rootPath,
        projectPath: project.projectPath,
        latestChangedAt,
        hasLogs: logs.length > 0,
        countsByStatus,
        totalItems: backlogItems.length,
        attention,
        latestLog
    };
}
async function determineLatestChangedAt(project) {
    const candidatePaths = [
        ...project.backlogSources.map((source) => source.path),
        path.join(project.projectPath, 'AGENTS.md'),
        path.join(project.projectPath, 'docs', 'spec.md'),
        path.join(project.projectPath, 'docs', 'architecture.md')
    ];
    if (project.logsPath) {
        const logFiles = await collectFiles(project.logsPath);
        candidatePaths.push(...logFiles);
    }
    const stats = await Promise.all(candidatePaths.map(async (candidatePath) => {
        try {
            const stat = await fs.stat(candidatePath);
            return stat.mtime;
        }
        catch {
            return null;
        }
    }));
    const latest = stats.reduce((current, value) => {
        if (!value) {
            return current;
        }
        if (!current || value.getTime() > current.getTime()) {
            return value;
        }
        return current;
    }, null);
    return latest ? latest.toISOString() : null;
}
async function parseAllBacklogs(project) {
    const parsed = await Promise.all(project.backlogSources.map(async (source) => parseBacklog(source.path, source.key, source.label)));
    return parsed.flat();
}
async function parseBacklog(backlogPath, backlogSourceKey, backlogSourceLabel) {
    const markdown = await fs.readFile(backlogPath, 'utf8');
    const lines = markdown.split(/\r?\n/);
    const tableStart = lines.findIndex((line) => line.trim().startsWith('|'));
    if (tableStart === -1 || tableStart + 2 >= lines.length) {
        return [];
    }
    const tableLines = [];
    for (let index = tableStart; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim().startsWith('|')) {
            break;
        }
        tableLines.push(line);
    }
    if (tableLines.length < 3) {
        return [];
    }
    const header = splitMarkdownRow(tableLines[0]);
    const dataLines = tableLines.slice(2);
    return dataLines
        .map((line) => parseBacklogRow(header, splitMarkdownRow(line), {
        backlogSourceKey,
        backlogSourceLabel
    }))
        .filter((item) => item !== null);
}
function parseBacklogRow(headers, values, source) {
    const record = {
        id: '',
        status: 'unknown',
        ownerZone: null,
        title: '',
        writeScope: null,
        dependsOn: null,
        doneWhen: null,
        validation: null,
        bossSignoff: null,
        notes: null,
        backlogSourceKey: source.backlogSourceKey,
        backlogSourceLabel: source.backlogSourceLabel,
        extraFields: {}
    };
    headers.forEach((header, index) => {
        const value = (values[index] ?? '').trim();
        const normalizedHeader = normalizeColumnName(header);
        const targetField = COLUMN_ALIASES[normalizedHeader] ?? null;
        if (!targetField) {
            if (header.trim()) {
                record.extraFields[header.trim()] = value;
            }
            return;
        }
        switch (targetField) {
            case 'id':
                record.id = value;
                break;
            case 'status':
                record.status = normalizeStatus(value);
                break;
            case 'ownerZone':
                record.ownerZone = value || null;
                break;
            case 'title':
                record.title = value;
                break;
            case 'writeScope':
                record.writeScope = value || null;
                break;
            case 'dependsOn':
                record.dependsOn = value || null;
                break;
            case 'doneWhen':
                record.doneWhen = value || null;
                break;
            case 'validation':
                record.validation = value || null;
                break;
            case 'bossSignoff':
                record.bossSignoff = value || null;
                break;
            case 'notes':
                record.notes = value || null;
                break;
            default:
                break;
        }
    });
    if (!record.id || !record.title) {
        return null;
    }
    return record;
}
function splitMarkdownRow(line) {
    return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((part) => part.trim());
}
function normalizeColumnName(column) {
    return column.toLowerCase().replace(/[^a-z]/g, '');
}
function normalizeStatus(value) {
    const normalized = value.toLowerCase().trim();
    switch (normalized) {
        case 'todo':
        case 'to do':
        case 'not_started':
        case 'not started':
            return 'todo';
        case 'in_progress':
        case 'in progress':
        case 'active':
            return 'in_progress';
        case 'blocked':
            return 'blocked';
        case 'done':
        case 'complete':
        case 'completed':
            return 'done';
        default:
            return 'unknown';
    }
}
async function loadProjectLogs(logsPath) {
    const files = await collectFiles(logsPath);
    const records = await Promise.all(files.map((file) => parseLogFile(file)));
    return records
        .flat()
        .sort((left, right) => {
        const leftValue = left.ts ? Date.parse(left.ts) : 0;
        const rightValue = right.ts ? Date.parse(right.ts) : 0;
        return rightValue - leftValue;
    })
        .slice(0, 250);
}
async function collectFiles(rootPath) {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
            return collectFiles(fullPath);
        }
        return [fullPath];
    }));
    return nested.flat();
}
async function parseLogFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const parsed = [];
    for (const [index, line] of lines.entries()) {
        try {
            const payload = JSON.parse(line);
            parsed.push({
                id: `${filePath}:${index + 1}`,
                ts: asString(payload.ts),
                itemId: asString(payload.item),
                zone: asString(payload.zone) ??
                    asString(payload.owner_zone) ??
                    asString(payload.ownerZone),
                agent: asString(payload.agent),
                event: asString(payload.event),
                stepVerdict: asString(payload.step_verdict),
                itemStatus: asString(payload.item_status) ?? asString(payload.status),
                summary: asString(payload.summary),
                nextGap: asString(payload.next_gap),
                evidenceInstructions: parseEvidenceInstructions(payload.evidence_instructions),
                raw: line,
                sourcePath: filePath
            });
        }
        catch {
            parsed.push({
                id: `${filePath}:${index + 1}`,
                ts: null,
                itemId: null,
                zone: null,
                agent: null,
                event: null,
                stepVerdict: null,
                itemStatus: null,
                summary: line.trim() || 'Unreadable log line',
                nextGap: null,
                evidenceInstructions: emptyEvidenceInstructions(),
                raw: line,
                sourcePath: filePath
            });
        }
    }
    return parsed;
}
async function loadFrameworkFiles(project) {
    const baseFiles = await Promise.all(FRAMEWORK_FILE_CONFIG.map(async (config) => {
        const absolutePath = path.join(project.projectPath, config.relativePath);
        if (!existsSync(absolutePath)) {
            return null;
        }
        return {
            key: config.key,
            label: config.label,
            path: absolutePath
        };
    }));
    const backlogFiles = project.backlogSources.map((source) => ({
        key: source.key,
        label: source.label,
        path: source.path
    }));
    return [...baseFiles.filter(Boolean), ...backlogFiles];
}
async function loadFrameworkFile(project, key) {
    const backlogSource = project.backlogSources.find((source) => source.key === key);
    const frameworkConfig = FRAMEWORK_FILE_CONFIG.find((config) => config.key === key);
    const absolutePath = backlogSource
        ? backlogSource.path
        : frameworkConfig
            ? path.join(project.projectPath, frameworkConfig.relativePath)
            : null;
    if (!absolutePath || !existsSync(absolutePath)) {
        return null;
    }
    const markdown = await fs.readFile(absolutePath, 'utf8');
    return {
        key,
        label: backlogSource ? backlogSource.label : frameworkConfig.label,
        path: absolutePath,
        markdown,
        html: await marked.parse(markdown)
    };
}
async function findBacklogPath(projectPath) {
    const docsPath = path.join(projectPath, 'docs');
    if (!existsSync(docsPath)) {
        return null;
    }
    const directBacklog = path.join(docsPath, 'backlog.md');
    if (existsSync(directBacklog)) {
        return directBacklog;
    }
    const candidates = await collectNamedFiles(docsPath, 'backlog.md');
    return candidates.sort((left, right) => left.length - right.length)[0] ?? null;
}
async function collectBacklogSources(projectPath, primaryBacklogPath) {
    const sources = [
        {
            key: createBacklogSourceKey(primaryBacklogPath),
            label: toProjectRelativeLabel(projectPath, primaryBacklogPath),
            path: primaryBacklogPath
        }
    ];
    const backlogDir = path.dirname(primaryBacklogPath);
    const siblingBacklogsDir = path.join(backlogDir, 'backlogs');
    if (!existsSync(siblingBacklogsDir)) {
        return sources;
    }
    const siblingFiles = await collectNamedMarkdownFiles(siblingBacklogsDir);
    for (const filePath of siblingFiles.sort()) {
        if (filePath === primaryBacklogPath) {
            continue;
        }
        sources.push({
            key: createBacklogSourceKey(filePath),
            label: toProjectRelativeLabel(projectPath, filePath),
            path: filePath
        });
    }
    return sources;
}
async function collectNamedFiles(rootPath, targetName) {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
            return collectNamedFiles(fullPath, targetName);
        }
        return entry.name.toLowerCase() === targetName.toLowerCase() ? [fullPath] : [];
    }));
    return nested.flat();
}
async function collectNamedMarkdownFiles(rootPath) {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
            return collectNamedMarkdownFiles(fullPath);
        }
        return entry.name.toLowerCase().endsWith('.md') ? [fullPath] : [];
    }));
    return nested.flat();
}
function createBacklogSourceKey(absolutePath) {
    return `backlog:${Buffer.from(absolutePath).toString('base64url')}`;
}
function toProjectRelativeLabel(projectPath, absolutePath) {
    return path.relative(projectPath, absolutePath).replace(/\\/g, '/');
}
function createProjectId(projectPath) {
    return Buffer.from(projectPath).toString('base64url');
}
function createEmptyCounts() {
    return {
        todo: 0,
        in_progress: 0,
        blocked: 0,
        done: 0,
        unknown: 0
    };
}
function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
function asString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function parseEvidenceInstructions(value) {
    if (Array.isArray(value)) {
        return {
            runThis: asStringArray(value),
            openThis: [],
            expectThis: []
        };
    }
    if (!value || typeof value !== 'object') {
        return emptyEvidenceInstructions();
    }
    const payload = value;
    return {
        runThis: asStringArray(payload.run_this),
        openThis: asStringArray(payload.open_this),
        expectThis: asStringArray(payload.expect_this)
    };
}
function emptyEvidenceInstructions() {
    return {
        runThis: [],
        openThis: [],
        expectThis: []
    };
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : 'Unknown server error.';
}
