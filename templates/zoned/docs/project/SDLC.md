# SDLC

Use this file for staged delivery guidance in zoned repos.

## Rules

- top-level items belong in `docs/project/BACKLOG.md`
- same-zone child items belong in `docs/project/backlogs/*.md`
- parent backlog items with child items must roll up from child status instead of drifting independently
- a parent item may be `todo` only when no child item has started
- a parent item must be `in_progress` when any child item is `in_progress`, or when any child item is `done` but the parent's own `Done When` condition is not yet satisfied
- a parent item may be `blocked` only when it is not done, no child item is actively in progress, and remaining completion is waiting on a real blocker such as an unmet dependency, required signoff, or a newly discovered blocker
- a parent item may be `done` only when its own `Done When` condition is satisfied, required validation exists, and required BOSS signoff has been obtained when applicable
- a parent item must never remain `todo` once any child item is `in_progress` or `done`
- cross-zone work should be split contract-first when possible
- completion requires evidence, not only a test claim
