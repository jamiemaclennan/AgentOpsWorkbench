# AGENTS

This repository is intended to support parallel work by humans and AI coding agents. The codebase and task structure should make that safe.

This file governs collaboration only. Product behavior, plugin contracts, viewer UX, and architecture details belong in the committed docs under `docs/`.

## Instruction Authority
Use instructions in this order:
1. The current user request
2. The nearest applicable `AGENTS.md` in the directory you are editing
3. This root `AGENTS.md`
4. Role files under `agents/`
5. Repo-local process docs under `docs/project/`
6. Repo-local specs under `docs/specs/`
7. Existing code, tests, and exemplars

Do not treat user-specific local files, personal notes, or external chat history as authoritative project state.

## Normative Language
The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are interpreted as described in RFC 2119.
MUST and MUST NOT rules are blocking requirements; if a user request conflicts with one, the agent MUST report the conflict and ask for an explicit role, work item, or process override.
SHOULD rules are strong defaults; agents may deviate only when they state why and do not violate a MUST or MUST NOT rule.

## Definitions
- `non-trivial work`: any change affecting behavior, contracts, architecture, workflow, validation, or more than one owner zone.
- `approved planner handoff`: a backlog item step produced or accepted by `planning-agent` with the required fields from `agents/planning-agent.md`.
- `same work item`: one backlog item ID, repo-local handoff, or user-requested task.
- `same session`: one role invocation operating under exactly one active role marker; a visible thread may contain multiple role invocations.
- `same visible thread`: one human-visible conversation that may coordinate multiple role invocations for the same work item.
- `orchestration role`: `[Coordinator]`, which routes work and manages process without performing execution-role responsibilities.
- `execution role`: `planning-agent`, `coding-agent`, or `evaluator-agent`.
- `role marker mapping`: `planning-agent` -> `[Planner]`, `coding-agent` -> `[Coder]`, `evaluator-agent` -> `[Evaluator]`.
- `scope change`: a change to goals, touched zones, contracts, validation, or spec level after planning.
- `final evaluation`: the evaluator pass that decides whether falsifiable goals passed, failed, or were not verified.

## Core Collaboration Rules
- Agents MUST operate under exactly one active role: `[Coordinator]` for orchestration, or one execution role for planning, coding, or evaluation.
- `[Coordinator]` MAY inspect repo state, route role invocations, summarize outcomes, and perform neutral workflow logistics.
- `[Coordinator]` MUST NOT produce planner handoffs, implement changes, or perform final evaluation for the same work item.
- Non-trivial execution work MUST be performed by exactly one execution role per invocation: `planning-agent`, `coding-agent`, or `evaluator-agent`.
- One agent session MUST NOT act as more than one execution role for the same work item.
- `planning-agent` MUST NOT make code changes.
- `evaluator-agent` MUST NOT make code changes.
- `coding-agent` MUST implement non-trivial work only from an approved planner handoff tied to the same work item.
- If implementation requires a scope change, `coding-agent` MUST stop and return the item to `planning-agent`.

## Response Identity
- Every agent response MUST begin with a line containing exactly one active role marker before any other output: `[Coordinator]`, `[Planner]`, `[Coder]`, or `[Evaluator]`.
- Use `[Coordinator]` for orchestration; execution-role invocations MUST use the marker matching their active role.

## Role Invocation
- For non-trivial work, each role change MUST use a new role invocation.
- A role invocation is a distinct agent run, sub-agent, or fresh thread operating under exactly one role directive.
- A coordinating thread MAY orchestrate role invocations, but MUST NOT perform execution-role work itself for the same work item.
- If the same visible thread continues across roles, the coordinator MUST state which role invocation produced the current handoff and which role acts next.

## Conversation Scope
- Users SHOULD use one work item per coordinating thread.
- Role transitions SHOULD use sub-agents or fresh threads rather than reusing the same agent session.
- Start fresh after major scope changes, long debugging loops, context compaction, or roughly 20-30 substantive turns.
- Durable state belongs in repo-local handoff notes, backlog items, specs, tests, or committed docs.

## Conflict Handling
- If user instructions conflict with a MUST rule, the agent MUST identify the conflict and ask for an explicit override.
- If implementation uncovers required scope expansion, `coding-agent` MUST stop and return the item to `planning-agent`.

## Backlog Gate

A coding agent may not write to any file unless a backlog item ID was provided in the handoff from the planning agent. The item ID must exist in `docs/project/BACKLOG.md` or a child backlog under `docs/project/backlogs/`.

**Exempt from this rule:**
- `docs/project/BACKLOG.md` and `docs/project/backlogs/*.md` -- backlog management is always permitted; this is how new work enters the system
- `logs/backlog-items/` -- log entries are written by the loop, not by coding agents

Guidance, plans, and advice provided to a human operator are not file writes and are not restricted. If a human asks the agent to act on that advice, a backlog item must exist first.

## Bug Handling

Bugs are tracked separately from backlog items so their IDs do not interleave with feature work.

- Bug files live at `docs/project/bugs/<zone>_bugs.md` (for example `app-viewer_bugs.md`).
- Bug IDs use the zone prefix plus a `B` series: `ALV-B001`, `AOW-B001`, and so on.
- Columns match the backlog table except `Depends On` is replaced by `Repro` and `Fix Commit`.
- Agents load only the bug file for the zone they are working in; do not load all bug files.
- The full planner-coder-evaluator loop applies to bug fixes; bugs are not fast-tracked.
- The Backlog Gate applies: a bug item must exist before the fix is written.

## Worktree Policy

Worktrees are for zones where parallel code changes could conflict.

Use a worktree for: `app-viewer` implementation, `transport`, `plugin-core`, `tooling`.

Do not use a worktree for: `docs`, backlog files, bug files, or `logs/backlog-items/`. These must be written directly on the working branch so changes are immediately visible to the board viewer and other agents.

## Rehydration

Use progressive disclosure when gathering context.

Default reading order:
- read `README.md`
- read `docs/project/START_HERE.md`
- read `agents/loop.md` -- required before selecting or executing any backlog item
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

## Avoid
- Do not put business rules only in prompts when they can be enforced in schemas, validators, or code.
- Do not create new root-level patterns if an existing pattern can be generalized.
- Do not depend on user-specific local files, absolute personal paths, or non-repo documentation for normal implementation flow.
- Do not expand unrelated capabilities unless the current task requires it.
