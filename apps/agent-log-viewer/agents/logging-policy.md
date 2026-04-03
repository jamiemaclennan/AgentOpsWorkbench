# Logging Policy

## Purpose

Define a low-conflict logging model for planner, coding, and evaluator activity during backlog execution.

The goal is to preserve a readable execution trail without requiring multi-agent file locking or a richer UI.

## Core Rule

Use one log per active top-level backlog item.

The planning agent is the only writer for that item's primary log.

## Why

- multiple agents should not write directly to the same file
- append-only logging is simpler when there is one writer
- the planner already receives coding and evaluator results
- one per-item log is easier to inspect than one per-agent log

## Log Location

Store logs under:

- `logs/backlog-items/`

Use one file per active item:

- `logs/backlog-items/ALV-005.ndjson`
- `logs/backlog-items/ALV-012.ndjson`

## Log Format

Use NDJSON.

Each line is one JSON object.

This keeps append behavior simple and allows:

- line-oriented appends
- easy grep/filtering
- later conversion into reports

## Required Fields

Each log entry must include:

- `ts`
- `item`
- `agent`
- `event`

## Recommended Fields

Add when relevant:

- `status`
- `step`
- `summary`
- `target`
- `step_verdict`
- `item_status`
- `next_gap`
- `recommended_next_action`

## Example

```json
{"ts":"2026-04-01T16:22:11Z","item":"ALV-005","agent":"planner","event":"dispatch","status":"in_progress","step":"Define parsed run-record envelope","target":"coding_agent"}
{"ts":"2026-04-01T16:23:02Z","item":"ALV-005","agent":"coding_agent","event":"result","status":"completed","summary":"Drafted record schema and severity normalization contract."}
{"ts":"2026-04-01T16:23:40Z","item":"ALV-005","agent":"evaluator_agent","event":"evaluation","step_verdict":"pass","item_status":"needs_more_work","next_gap":"Add one canonical example record set."}
{"ts":"2026-04-01T16:24:01Z","item":"ALV-005","agent":"planner","event":"next_step","status":"in_progress","step":"Add one canonical example record set to spec."}
```

## Planner Logging Responsibilities

The planning agent should append a log entry when:

- an item loop starts
- a coding step is dispatched
- coding results are received
- evaluator results are received
- the next step is chosen
- the item is marked complete
- the item is marked blocked

## Coding And Evaluator Responsibilities

Coding and evaluator agents should not write directly to the item log.

They should return structured results to the planner, and the planner should append the log entry.

## Optional Expanded Logging

If raw agent-local traces are ever needed, use separate files under an item directory, for example:

- `logs/backlog-items/ALV-005/planner.ndjson`
- `logs/backlog-items/ALV-005/coder-1.ndjson`
- `logs/backlog-items/ALV-005/evaluator.ndjson`

Do not enable this by default.
