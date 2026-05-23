# Project Backlog

This file is the canonical cross-zone backlog for `[PROJECT_NAME]`.

## Rules

- `docs/project/BACKLOG.md` contains only top-level or cross-zone items.
- `docs/project/backlogs/*.md` contain same-zone child items using the same schema.
- Parent items with child items must roll up from child status plus the parent's own closure gates.
- A parent item may be `todo` only when no child item has started.
- A parent item must be `in_progress` when any child item is `in_progress`, or when any child item is `done` but the parent's own `Done When` condition is not yet satisfied.
- A parent item may be `blocked` only when it is not done, no child item is actively in progress, and remaining completion is waiting on a real blocker such as an unmet dependency, required signoff, or a newly discovered blocker.
- A parent item may be `done` only when its own `Done When` condition is satisfied, required validation exists, and required BOSS signoff has been obtained when applicable.
- A parent item must never remain `todo` once any child item is `in_progress` or `done`.

| ID | Status | Owner Zone | Item | Write Scope | Depends On | Done When | Validation | Access | BOSS Signoff | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| APP-001 | todo | docs | Define the initial zoned framework and product specs | `AGENTS.md`, `docs/project/*`, `docs/specs/*`, `agents/*` | None | The zoned framework docs exist and point contributors to the correct execution and spec locations. | File review. | Open `docs/project/START_HERE.md` and `docs/project/BACKLOG.md`. | no | Replace this seed item with the project's real top-level work. |
