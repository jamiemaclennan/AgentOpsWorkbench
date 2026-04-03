# Validation Strategy

## Purpose

Define the minimum validation evidence required before work on `[PROJECT_NAME]` can be considered complete.

## Required Validation Categories

- unit tests for core rules or state behavior
- integration-style tests for orchestration behavior
- smoke coverage for user-facing flows when a UI exists

## Boss-Facing Signoff Instructions

Whenever an item is implemented or reported complete, include `Signoff instructions for <ITEM-ID>:` written for the BOSS.

These instructions are per backlog item.
If multiple backlog items are completed in one response, each completed item must get its own independent signoff block.
Do not merge multiple backlog items into one shared validation sequence.

Preferred format:
1. `Run:` and a fenced code block for required commands
2. `Open:` the page, file, or URL to inspect
3. `Click:` or other interaction steps when needed
4. `Check:` a flat bullet list of specific observable outcomes
5. `If acceptable, reply:` the exact signoff response when approval is requested

Use only the steps needed for the item, but keep the numbering style and labels.
Do not stop at listing tests run without translating them into concrete review steps and observable outcomes.

## First-Slice Validation Gate

A feature is not ready to close unless the relevant validation category has been executed or explicitly deferred into a separate backlog item, and boss-facing signoff instructions are included in the close-out for that specific item.
