# Agent Ops Workbench

This repository packages a reusable Codex plugin for backlog-driven, multiagent delivery and bundles a companion viewer for inspecting logs, evidence, and signoff flows.

## Repository Layout

- `.codex-plugin/`, `skills/`, `templates/`, and `scripts/` contain the plugin and its transport/template machinery
- `apps/agent-log-viewer/` contains the bundled viewer app
- `docs/` and `agents/` describe how the repo itself is operated and evolved

## Running The Bundled Viewer

From `apps/agent-log-viewer/`:

```powershell
npm install
npm run dev
```

This starts the viewer client and server using the app's own `package.json` scripts.

## What Ships

- reusable compact and zoned repo templates
- a bootstrap skill for applying or normalizing the framework
- cross-platform export/import scripts for moving the plugin between machines
- a bundled viewer app for reviewing logs and signoff-oriented evidence
