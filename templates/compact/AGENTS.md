# AGENTS

This repository is intended to support parallel work by humans and AI coding agents. The codebase and task structure should make that safe.

This file governs collaboration only. Product behavior, rules, UX intent, and architecture details belong in the committed docs under `docs/`.

## Core Rule

No feature may require simultaneous edits across unrelated zones when a cleaner boundary can be introduced first.

If a task naturally crosses zone boundaries, split it into contract work first and implementation work second.

## Commit Cadence

Commit after every file-changing instruction when the resulting change is coherent.

If a task cannot be cleanly committed because the write scope is still mixed or unstable, split the task further before continuing.

## Rehydration

Use progressive disclosure when gathering context.

Default reading order:
- read top-level indexes and headers first
- read the local contract or spec for the area you are changing
- read deeper implementation details only when the task requires them

Avoid deep-reading unrelated modules by default. Compartmentalization is a feature, not a weakness.

Instruction authority for this repo comes from:
- the BOSS in the current thread
- this repo's committed docs under `docs/`
- this repo's committed code and tests

Execution scaffold for parallel work:
- top-level and cross-zone backlog items live in `docs/backlog.md`
- same-zone child backlog items live in `docs/backlogs/*.md`
- staged delivery guidance lives in `docs/sdlc.md`
- planner/coding/evaluator loop guidance lives in `agents/`
- active multi-agent execution logs belong in `logs/backlog-items/`

Backlog bookkeeping rule:
- if a parent item has child items, the parent status must roll up from child status plus the parent's own closure gates
- a parent item may be `todo` only when no child item has started
- a parent item must be `in_progress` when any child item is `in_progress`, or when any child item is `done` but the parent's own `Done When` condition is not yet satisfied
- a parent item may be `blocked` only when it is not done, no child item is actively in progress, and remaining completion is waiting on a real blocker such as an unmet dependency, required signoff, or a newly discovered blocker
- a parent item may be `done` only when its own `Done When` condition is satisfied, required validation exists, and required BOSS signoff has been obtained when applicable
- a parent item must never remain `todo` once any child item is `in_progress` or `done`

## Owner Zones

Use these ownership zones when planning work.

### `docs`

Scope:
- `AGENTS.md`
- backlog, milestone, decision, validation, and workstream docs
- product, architecture, and UX specs

Must not:
- implement production rules
- implement application flow
- implement client rendering

### `domain`

Scope:
- pure rules and state transitions
- authoritative state and validation logic

Must not depend on:
- DOM
- framework UI state
- rendering timers
- random side effects without explicit injection

### `application`

Scope:
- orchestration
- use-case flow
- command routing
- session or process lifecycle

Must not:
- redefine authoritative rules
- absorb presentation-only state

### `client-web`

Scope:
- UI components
- layout, controls, styling, and view models
- browser-facing interaction behavior

Must not:
- become the source of truth for rules or process state
- re-implement domain logic already present elsewhere

### `tooling`

Scope:
- tests
- scripts
- validation support
- fixtures and scenarios

Must not:
- redefine product behavior through test-only assumptions
- silently replace spec decisions with tooling conventions

## Validation Obligation

Contributor validation must be understandable to the project lead.

Do not stop at:
- `tests pass`
- raw assertion names
- multi-step manual repro instructions without artifacts

Use `docs/validation.md` as the standard for review evidence.
