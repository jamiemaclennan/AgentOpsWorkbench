# Validation

Use this file to define the review evidence required for each workstream in Agent Ops Workbench.

Minimum expectation:
- direct file review, test, or smoke evidence for the changed layer
- a short review path for BOSS when signoff is required
- explicit follow-on backlog items for deferred validation

## Boss-Facing Signoff Instruction Rule

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
