# Agent Loop

## Role Separation Mandate

STOP. Before reading further, confirm which role applies to this invocation:

- If you are the **coordinator**: you may inspect repo state, route role invocations, summarize outcomes, and perform neutral workflow logistics. You must not produce planner handoffs, implement changes, or perform final evaluation for the same work item. See `agents/coordinator.md`.
- If you are the **planning agent**: you may select a backlog item, identify the next step, and issue a handoff. You must not write implementation code or evaluate results. Delegate to a separate coding agent session.
- If you are the **coding agent**: you may implement only the step handed to you. You must not select backlog items, define acceptance criteria, or evaluate your own output. Return evidence to a separate evaluator agent session.
- If you are the **evaluator agent**: you may assess completed work against written criteria. You must not write implementation code or modify the plan. Return your verdict to the planning agent.

Every response MUST begin with exactly one role marker before any other output: `[Coordinator]`, `[Planner]`, `[Coder]`, or `[Evaluator]`.

A single agent session performing more than one execution role violates the loop and invalidates the log. If you are uncertain which role applies, stop and request clarification from the operator before proceeding.

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
- objective
- falsifiable goals
- in scope
- out of scope
- owner zone
- sub-step goal
- allowed write scope
- contracts
- targeted acceptance detail
- required validation evidence
- risks / open questions
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
- signoff instructions written for the BOSS when the item is complete or ready for BOSS review

## Logging Rule

The planning agent is the single writer for `logs/backlog-items/<ITEM_ID>.ndjson`.

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
