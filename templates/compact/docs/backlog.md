# Backlog

This file is the canonical short-term work tracker for `[PROJECT_NAME]`.

## Rules

- Every item has one status.
- Every item has one primary owner zone.
- Every item should name a write scope before implementation starts.
- Every item must have a falsifiable `Done When` condition.
- Each item must state whether BOSS signoff is required for closure.
- Each item must state how to access or run the result of the work.
- `docs/backlog.md` contains only top-level cross-zone items.
- `docs/backlogs/*.md` contain zone-local child items using the same schema.
- Parent items with child items must roll up from child status plus the parent's own closure gates.
- A parent item may be `todo` only when no child item has started.
- A parent item must be `in_progress` when any child item is `in_progress`, or when any child item is `done` but the parent's own `Done When` condition is not yet satisfied.
- A parent item may be `blocked` only when it is not done, no child item is actively in progress, and remaining completion is waiting on a real blocker such as an unmet dependency, required signoff, or a newly discovered blocker.
- A parent item may be `done` only when its own `Done When` condition is satisfied, required validation exists, and required BOSS signoff has been obtained when applicable.
- A parent item must never remain `todo` once any child item is `in_progress` or `done`.

## Active Backlog

| ID | Status | Owner Zone | Item | Write Scope | Depends On | Done When | Validation | Access | BOSS Signoff | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-001 | todo | docs | Define initial project framework and product docs | `AGENTS.md`, `docs/spec.md`, `docs/architecture.md`, `docs/backlog.md`, `docs/sdlc.md` | None | The repo contains an agent guidance file and the initial framework docs needed to guide implementation. | File review. | Open the created docs and confirm they match the intended first slice. | no | Replace this seed item with the project's real top-level work. |
