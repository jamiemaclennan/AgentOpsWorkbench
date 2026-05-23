import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const APP_ROOT = process.cwd();
const SERVER_ENTRY = path.join(APP_ROOT, 'server', 'index.ts');
const SERVER_URL = 'http://127.0.0.1:4310';
const DEFAULT_ROOT = 'C:\\work';
const MISSING_ROOT = 'C:\\work\\__agent_log_viewer_missing_root__';
const REPRESENTATIVE_PROJECTS = ['AgentOpsWorkbench', 'AgentLogViewer', 'MultiTacToe'];

async function main() {
  if (!existsSync(path.join(APP_ROOT, 'node_modules', 'tsx'))) {
    throw new Error('Missing local tsx package in node_modules.');
  }

  const server = spawn(process.execPath, ['--import', 'tsx', SERVER_ENTRY], {
    cwd: APP_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logBuffer = [];
  server.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    logBuffer.push(text);
  });
  server.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    logBuffer.push(text);
  });

  try {
    await waitForServer();

    const projectsResponse = await fetchJson(`/api/projects?${new URLSearchParams({ roots: DEFAULT_ROOT })}`);
    const projectNames = projectsResponse.projects.map((project) => project.name);
    const representativeMatches = REPRESENTATIVE_PROJECTS.filter((name) => projectNames.includes(name));

    assert(projectsResponse.projects.length >= 2, 'Expected at least two trackable projects under C:\\work.');
    assert(
      representativeMatches.length >= 2,
      `Expected representative projects in discovery results. Found: ${projectNames.join(', ')}`
    );

    const detailedProjects = await Promise.all(
      projectsResponse.projects
        .filter((project) => representativeMatches.includes(project.name))
        .slice(0, 2)
        .map((project) => fetchJson(`/api/projects/${project.id}?${new URLSearchParams({ roots: DEFAULT_ROOT })}`))
    );

    for (const detail of detailedProjects) {
      assert(detail.backlogItems.length > 0, `Expected backlog items for ${detail.project.name}.`);
      assert(Array.isArray(detail.frameworkFiles), `Expected framework files for ${detail.project.name}.`);
    }

    const liveEvents = createSseClient(`${SERVER_URL}/api/events?${new URLSearchParams({ roots: DEFAULT_ROOT })}`);
    const connected = await liveEvents.waitFor((event) => event.event === 'connected');
    assert(connected.data.watchStatus?.isLive === true, 'Expected watcher session to report live status for C:\\work.');

    const validationFile = path.join(APP_ROOT, '..', '..', 'logs', 'backlog-items', 'ALV-validation-temp.ndjson');
    const tempRecord = JSON.stringify({
      ts: new Date().toISOString(),
      item: 'ALV-005',
      agent: 'validation-script',
      event: 'validation'
    });

    await fs.writeFile(validationFile, `${tempRecord}\n`, 'utf8');

    const changeEvent = await liveEvents.waitFor(
      (event) =>
        event.event === 'project-change' &&
        event.data.kind === 'change' &&
        typeof event.data.path === 'string' &&
        event.data.path.includes('AgentOpsWorkbench/logs/backlog-items/ALV-validation-temp.ndjson')
    );

    assert(changeEvent.data.watchStatus?.isLive === true, 'Expected live watcher status during change notification.');
    await fs.rm(validationFile, { force: true });
    liveEvents.close();

    const fallbackEvents = createSseClient(
      `${SERVER_URL}/api/events?${new URLSearchParams({ roots: `${DEFAULT_ROOT},${MISSING_ROOT}` })}`
    );
    const fallbackConnected = await fallbackEvents.waitFor((event) => event.event === 'connected');

    assert(
      fallbackConnected.data.watchStatus?.isLive === false,
      'Expected watcher session to degrade to fallback when a configured root is unavailable.'
    );
    assert(
      fallbackConnected.data.watchStatus?.unavailableRoots?.includes(MISSING_ROOT),
      'Expected missing root to be reported in watcher status.'
    );
    fallbackEvents.close();

    console.log('');
    console.log('Validation passed.');
    console.log(`Projects discovered: ${projectNames.join(', ')}`);
    console.log(`Representative projects validated: ${representativeMatches.join(', ')}`);
    console.log(`Watcher change path: ${changeEvent.data.path}`);
  } finally {
    server.kill();
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_URL}/api/projects`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await sleep(250);
  }

  throw new Error('Timed out waiting for the local API server.');
}

async function fetchJson(requestPath) {
  const response = await fetch(`${SERVER_URL}${requestPath}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${requestPath}: ${response.status}`);
  }
  return response.json();
}

function createSseClient(url) {
  const events = [];
  const waiters = [];
  let buffer = '';

  const request = http.get(url);
  request.on('response', (response) => {
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      buffer += chunk;
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseEvent(rawEvent);
        if (parsed) {
          events.push(parsed);
          flushWaiters();
        }
        boundary = buffer.indexOf('\n\n');
      }
    });
  });

  request.on('error', (error) => {
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter.reject(error);
    }
  });

  function flushWaiters() {
    for (let index = 0; index < waiters.length; ) {
      const waiter = waiters[index];
      const match = events.find(waiter.predicate);
      if (!match) {
        index += 1;
        continue;
      }

      waiters.splice(index, 1);
      waiter.resolve(match);
    }
  }

  return {
    waitFor(predicate, timeoutMs = 10_000) {
      const existing = events.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const waiterIndex = waiters.findIndex((entry) => entry.resolve === resolve);
          if (waiterIndex >= 0) {
            waiters.splice(waiterIndex, 1);
          }
          reject(new Error(`Timed out waiting for SSE event from ${url}`));
        }, timeoutMs);

        waiters.push({
          predicate,
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });
      });
    },
    close() {
      request.destroy();
    }
  };
}

function parseSseEvent(rawEvent) {
  if (!rawEvent.trim()) {
    return null;
  }

  const lines = rawEvent.split(/\r?\n/);
  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: JSON.parse(dataLines.join('\n'))
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
