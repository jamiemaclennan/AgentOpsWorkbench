# Agent Loop

## Purpose

Define the standard operating loop between the planning agent, coding agent, and evaluator agent for one backlog item.

## Standard Sequence

1. Planning agent selects one active backlog item.
2. Planning agent identifies the next smallest useful step.
3. Planning agent sends that narrow step to the coding agent.
4. Coding agent performs only that step and returns evidence.
5. Evaluator agent checks the result against the backlog item.
6. Evaluator agent returns a structured verdict to the planning agent.
7. Planning agent decides whether to close the item, send the next step, block the item, or split it.

## Handoff Fields

Planner to coding agent:
- backlog item id
- owner zone
- sub-step goal
- allowed write scope
- targeted acceptance detail
- required validation evidence
- whether BOSS signoff is required

Coding to evaluator:
- backlog item id
- owner zone
- sub-step completed
- files changed
- validation performed
- criteria addressed
- known remaining gaps

Evaluator to planner:
- item id
- owner zone
- step verdict: `pass`, `fail`, or `partial`
- item status recommendation: `complete`, `needs_more_work`, or `blocked`
- criteria satisfied
- criteria not satisfied
- validation evidence checked
- next gap to close
- recommended next planner action
- repro steps
- boss review steps when required
- signoff instructions written for the BOSS

## Logging Rule

The planning agent is the single writer for `logs/backlog-items/<ITEM_ID>.ndjson`.

## Parent/Child Bookkeeping Rule

When a parent backlog item has child items, the planning agent must keep the parent status rolled up from child status plus the parent's own closure gates.

- `todo` only when no child item has started
- `in_progress` when any child item is `in_progress`, or when any child item is `done` but the parent's own `Done When` condition is not yet satisfied
- `blocked` only when the parent is not done, no child item is actively in progress, and remaining completion is waiting on a real blocker such as an unmet dependency, required signoff, or a newly discovered blocker
- `done` only when the parent's own `Done When` condition is satisfied, required validation exists, and required BOSS signoff has been obtained when applicable

A parent item must never remain `todo` once any child item is `in_progress` or `done`.

## Completion Rule

A backlog item is complete only when the written `Done When` criteria are satisfied, the required evidence exists, any required BOSS signoff has been obtained, and boss-facing signoff instructions are included for that specific backlog item.

## Signoff Instruction Rule

Whenever an item is implemented or the assistant claims an item's `Done When` condition is met, the close-out must include `Signoff instructions for <ITEM-ID>:` written for the BOSS.

These instructions are item-scoped, not batch-scoped.
If multiple backlog items are completed in one response, each completed item must have its own independent signoff-instructions block.
Do not merge multiple backlog items into one shared validation or signoff sequence.

Preferred structure:
1. `Run:` commands needed to prepare or validate the result
2. `Open:` the page, file, or URL to inspect
3. `Click:` required interactions, when applicable
4. `Check:` a flat bullet list of the specific observable outcomes to verify
5. `If acceptable, reply:` the exact signoff response to give when approval is requested

Use the numbered sequence only for steps the BOSS actually needs. Keep each instruction concrete and reviewable.
