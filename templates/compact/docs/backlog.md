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

## Active Backlog

| ID | Status | Owner Zone | Item | Write Scope | Depends On | Done When | Validation | Access | BOSS Signoff | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-001 | todo | docs | Define initial project framework and product docs | `AGENTS.md`, `docs/spec.md`, `docs/architecture.md`, `docs/backlog.md`, `docs/sdlc.md` | None | The repo contains an agent guidance file and the initial framework docs needed to guide implementation. | File review. | Open the created docs and confirm they match the intended first slice. | no | Replace this seed item with the project's real top-level work. |
