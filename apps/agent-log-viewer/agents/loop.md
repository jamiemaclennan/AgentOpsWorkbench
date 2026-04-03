# Agent Loop

## Purpose

Define the standard operating loop between the planning agent, coding agent, and evaluator agent for one backlog item.

This workflow exists to keep work incremental, falsifiable, and easy to recover when an item needs multiple turns.

## Loop Scope

- One loop operates on one active backlog item.
- The planning agent owns the item until it is `complete` or `blocked`.
- The coding agent performs only the next smallest useful implementation step.
- The evaluator agent checks both the latest step and the backlog item as a whole.
- The planning agent is the single writer for that item's primary log file.

## Standard Sequence

1. Planning agent selects one active backlog item.
2. Planning agent identifies the next smallest useful step.
3. Planning agent sends that narrow step to the coding agent.
4. Coding agent performs only that step and returns evidence.
5. Evaluator agent checks the result against the backlog item.
6. Evaluator agent returns a structured verdict to the planning agent.
7. Planning agent decides:
   - close the item
   - send the next narrow step
   - mark the item blocked
   - split the item if it is not cleanly falsifiable

## Planning Agent Input To Coding Agent

Each instruction should include:

- backlog item id
- sub-step goal
- allowed write scope
- targeted acceptance detail
- required validation evidence
- whether BOSS signoff is required for the full item

## Coding Agent Output To Evaluator

Each handoff should include:

- backlog item id
- sub-step completed
- files changed
- validation performed
- criteria addressed by the step
- known remaining gaps
- repro notes if useful

## Evaluator Output To Planning Agent

Each evaluation should include:

- item id
- step verdict: `pass`, `fail`, or `partial`
- item status recommendation: `complete`, `needs_more_work`, or `blocked`
- criteria satisfied
- criteria not satisfied
- validation evidence checked
- next gap to close
- recommended next planner action
- repro steps
- boss review steps when required

## Logging Rule

Each active backlog item should have one primary log file under:

- `logs/backlog-items/<ITEM_ID>.ndjson`

The planning agent should append log entries for major state transitions.

Coding and evaluator agents should return structured results to the planner rather than writing directly to the shared item log.

## Small-Step Rule

The default assumption is that the coding agent should do less, not more.

Examples of good next steps:

- define one contract
- add one parsing edge case
- wire one visible control
- add one missing test for an already implemented behavior

Examples of bad next steps:

- implement the whole backlog item
- fix nearby issues while in the area
- add polish that is not required for the next evaluation

## Completion Rule

A backlog item is complete only when:

- the evaluator finds that the written `Done When` criteria are satisfied
- the required validation evidence exists
- required BOSS signoff has been obtained when applicable

## BOSS Review Rule

When BOSS signoff is required, the evaluator must provide a short review path:

- `run this: ...`
- `open this: ...`
- `do this: ...`
- `expect this: ...`

That review path should cover only the intent-sensitive decision the boss needs to confirm.
Do not ask the boss to verify implementation or documentation exactness that the evaluator can already test directly.
The evaluator should also provide a concise summary argument describing why the work appears correct and what exact semantic or UX decision remains for BOSS approval.

The planning agent should not close the item until that signoff requirement is satisfied.
