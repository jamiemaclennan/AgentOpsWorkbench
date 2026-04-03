# AGENTS

## Purpose

This repository contains the scaffolding for AgentLogViewer, a browser-based tool for inspecting, filtering, and reviewing logs produced by agent-driven work.

The goal of this file is to keep contributors aligned on scope, architecture boundaries, and delivery discipline before implementation starts.

## Product Intent

- Build a modern browser app for reading agent execution logs without raw-file spelunking.
- Support fast inspection of sessions, runs, steps, findings, and failures.
- Preserve strict separation between log ingestion, derived view models, and presentation.
- Keep the first implementation iteration simple, deterministic, and testable.

## Delivery Rules

1. Treat parsed log data as the source of truth.
2. Keep UI state separate from parsed log records unless the value must be serialized.
3. Do not place parsing, normalization, or filtering rules inside UI components.
4. Do not place file-system or transport concerns inside rendering code.
5. Prefer small, composable modules over large manager classes.
6. Keep docs current when architecture, scope, or backlog priorities change.

## Architecture Boundaries

### `src/logs/domain`

- Pure record contracts, parsing rules, normalization, and query helpers.
- No DOM, no React, no implicit process-wide state.

### `src/logs/application`

- Orchestrates loading, refresh, selection, filtering, and derived session state.
- Bridges data sources, parsed records, and UI-triggered commands.

### `src/logs/infrastructure`

- File adapters, storage adapters, and other environment-specific IO.
- No rendering logic and no UI-owned state.

### `src/ui`

- React components, layout, controls, view models, and styling.
- Renders lists, timelines, detail panes, filters, and status states.
- Never re-implements parsing or canonical filtering rules already present elsewhere.

## Quality Bar

- Parsing and normalization logic must be easy to unit test in isolation.
- Data contracts must stay stable enough for fixtures and regression review.
- UI must remain usable on desktop-first layouts and degrade cleanly on smaller screens.
- New features should map to a backlog item before implementation.

## Working Agreement

- Update `docs/spec.md` for scope changes.
- Update `docs/backlog.md` when priorities shift or work is completed.
- Update `docs/sdlc.md` when process expectations change.
