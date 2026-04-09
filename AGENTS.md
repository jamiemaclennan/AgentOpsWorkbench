# AGENTS

This repository is intended to support parallel work by humans and AI coding agents. The codebase and task structure should make that safe.

This file governs collaboration only. Product behavior, plugin contracts, viewer UX, and architecture details belong in the committed docs under `docs/`.

## Core Rule

No feature may require simultaneous edits across unrelated zones when a cleaner boundary can be introduced first.

If a task naturally crosses zone boundaries, split it into contract work first and implementation work second.

## Agent Role Rule

No single agent session may act as planner, coder, and evaluator for the same backlog item.

These are three distinct roles defined in `agents/`. Each role must be performed by a separate agent invocation. If you are reading this as a planning agent, you must delegate implementation to a coding agent and evaluation to an evaluator agent — you may not perform those steps yourself in this session.

If you are unsure which role applies to your current invocation, read `agents/loop.md` before proceeding.

## Backlog Gate

A coding agent may not write to any file unless a backlog item ID was provided in the handoff from the planning agent. The item ID must exist in `docs/project/BACKLOG.md` or a child backlog under `docs/project/backlogs/`.

**Exempt from this rule:**
- `docs/project/BACKLOG.md` and `docs/project/backlogs/*.md` — backlog management is always permitted; this is how new work enters the system
- `logs/backlog-items/` — log entries are written by the loop, not by coding agents

Guidance, plans, and advice provided to a human operator are not file writes and are not restricted. If a human asks the agent to act on that advice, a backlog item must exist first.

## Bug Handling

Bugs are tracked separately from backlog items so their IDs do not interleave with feature work.

- Bug files live at `docs/project/bugs/<zone>_bugs.md` (e.g. `app-viewer_bugs.md`)
- Bug IDs use the zone prefix plus a `B` series: `ALV-B001`, `AOW-B001`, etc.
- Columns match the backlog table except `Depends On` is replaced by `Repro` and `Fix Commit`
- Agents load only the bug file for the zone they are working in — do not load all bug files
- The full planner-coder-evaluator loop applies to bug fixes; bugs are not fast-tracked
- The Backlog Gate applies: a bug item must exist before the fix is written

## Worktree Policy

Worktrees are for zones where parallel code changes could conflict.

Use a worktree for: `app-viewer` implementation, `transport`, `plugin-core`, `tooling`.

Do not use a worktree for: `docs`, backlog files, bug files, or `logs/backlog-items/`. These must be written directly on the working branch so changes are immediately visible to the board viewer and other agents.

## Rehydration

Use progressive disclosure when gathering context.

Default reading order:
- read `README.md`
- read `docs/project/START_HERE.md`
- read `agents/loop.md` — required before selecting or executing any backlog item
- read `docs/project/BACKLOG.md`
- read the relevant file under `docs/specs/`
- read deeper implementation details only when the task requires them

Execution scaffold for parallel work:
- top-level and cross-zone backlog items live in `docs/project/BACKLOG.md`
- same-zone child backlog items live in `docs/project/backlogs/*.md`
- zone bug trackers live in `docs/project/bugs/<zone>_bugs.md`
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
