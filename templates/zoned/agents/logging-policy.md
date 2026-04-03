# Logging Policy

## Core Rule

Use one log per active top-level backlog item. The planning agent is the only writer for that item's primary log.

## Log Location

- `logs/backlog-items/<ITEM_ID>.ndjson`

## Required Fields

- `ts`
- `item`
- `zone`
- `agent`
- `event`

## Completion Evidence

Completion entries must include explicit boss-facing signoff instructions that tell a reviewer how to obtain or inspect the evidence.

These instructions must be scoped to one backlog item per block.
If multiple items are completed, record separate signoff instructions for each item instead of one merged sequence.

Preferred close-out structure:
- short outcome summary
- `Signoff instructions for <ITEM-ID>:`
- numbered steps such as `Run`, `Open`, `Click`, `Check`, and `If acceptable, reply`

`Check` should contain a flat bullet list of the exact observable outcomes.
