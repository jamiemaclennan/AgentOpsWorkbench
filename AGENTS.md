# AGENTS

This repository is intended to support parallel work by humans and AI coding agents. The codebase and task structure should make that safe.

This file governs collaboration only. Product behavior, plugin contracts, viewer UX, and architecture details belong in the committed docs under `docs/`.

## Core Rule

No feature may require simultaneous edits across unrelated zones when a cleaner boundary can be introduced first.

If a task naturally crosses zone boundaries, split it into contract work first and implementation work second.

## Rehydration

Use progressive disclosure when gathering context.

Default reading order:
- read `README.md`
- read `docs/project/START_HERE.md`
- read `docs/project/BACKLOG.md`
- read the relevant file under `docs/specs/`
- read deeper implementation details only when the task requires them

Execution scaffold for parallel work:
- top-level and cross-zone backlog items live in `docs/project/BACKLOG.md`
- same-zone child backlog items live in `docs/project/backlogs/*.md`
- staged delivery guidance lives in `docs/project/SDLC.md`
- planner/coding/evaluator loop guidance lives in `agents/`
- active multi-agent execution logs belong in `logs/backlog-items/`

## Owner Zones

### `docs`

Scope:
- collaboration docs
- project docs and specs
- backlog and planning artifacts

Must not:
- implement plugin behavior
- implement transport logic
- implement viewer runtime code

### `plugin-core`

Scope:
- `.codex-plugin/`
- `skills/`
- root plugin metadata
- framework conventions and reusable scaffolding logic

Must not:
- absorb viewer-specific UI behavior
- redefine transport behavior that belongs in `scripts/`

### `templates`

Scope:
- `templates/compact/`
- `templates/zoned/`
- shipped repo scaffolding

Must not:
- silently diverge from the framework rules documented in `skills/` and `docs/`
- contain project-specific product behavior

### `transport`

Scope:
- `scripts/`
- export/import and portability workflows

Must not:
- redefine plugin policy or template semantics
- absorb viewer runtime code

### `app-viewer`

Scope:
- `apps/agent-log-viewer/`
- bundled companion UI for reviewing logs, evidence, and signoff flows

Must not:
- become the source of truth for plugin metadata or template rules

### `tooling`

Scope:
- validation helpers
- repo automation
- future CI or release support

Must not:
- redefine product behavior through test-only assumptions

## Validation Obligation

Contributor validation must be understandable to the project lead.

Do not stop at:
- `tests pass`
- raw assertion names
- multi-step manual repro instructions without observable checks

Use `docs/project/VALIDATION.md` as the standard for review evidence and signoff instructions.
