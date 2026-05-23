---
name: agent-ops-workbench-bootstrap
description: Install or update a repository using the concrete compact or zoned framework templates shipped with this plugin. Use when setting up a new repo, normalizing an existing repo, detecting when a compact repo should migrate to zoned mode, or advising how an already-structured project can converge on the framework with minimal churn.
---

# Agent Ops Workbench Bootstrap

## Purpose

Use the concrete template files in this plugin to install or update a reusable Agent Ops Workbench framework for backlog-driven, multiagent repository work.

This skill is template-first. Do not invent framework file contents from scratch when a shipped template already exists.

## Template Roots

Use one of these template trees:
- `templates/compact/`
- `templates/zoned/`

Read the matching template files directly and copy or adapt them into the target repo.

## Mode Selection

Use compact mode when the repo is a smaller application, prototype, or single-product codebase.

Use zoned mode when the repo already has, or clearly needs, stronger cross-zone isolation and deeper project/spec separation.

## Compact To Zoned Migration Signals

Treat a compact repo as a migration candidate when several of these are true:
- the repo has multiple independent ownership areas that regularly block each other
- top-level backlog items are repeatedly decomposed into many child items across several subsystems
- the flat `docs/` layout is mixing durable specs with active project-management documents
- contributors need stronger separation between architecture or product specs and execution tracking
- cross-zone coordination is becoming the default rather than the exception
- the repo has grown beyond a single clear product slice and now needs staged workstream ownership

When these signals appear:
1. explain why compact mode is no longer a good fit
2. propose the zoned layout as the next framework step
3. preserve existing product-specific content while moving execution docs into the zoned structure
4. migrate in small steps rather than replacing the repo wholesale

## Signoff Instruction Rule

Whenever an item is implemented or the assistant claims an item's `Done When` condition is met, the close-out must include a short outcome summary followed by `Signoff instructions for <ITEM-ID>:` written for the BOSS.

These instructions are per backlog item, not per response.
If multiple backlog items are completed in one response, each completed item must have its own independent `Signoff instructions for <ITEM-ID>:` block.
Do not merge multiple backlog items into one shared validation or signoff sequence.

Preferred format:
1. `Run:` and a fenced code block for required commands
2. `Open:` the page, file, or URL to inspect
3. `Click:` or other interaction steps when needed
4. `Check:` a flat bullet list of the specific observable outcomes to verify
5. `If acceptable, reply:` the exact signoff response when approval is requested

Use only the steps needed for the item, but keep this numbered label format. Do not stop at listing tests run. Translate the evidence into concrete review steps and observable outcomes.

An item is not considered fully reported complete unless these boss-facing signoff instructions are included for that specific item.

## Parent/Child Rollup Rule

When a repo uses top-level backlog items plus child items, make the rollup semantics explicit in the local workflow docs instead of leaving them implicit.

- `todo` only when no child item has started
- `in_progress` when any child item is `in_progress`, or when any child item is `done` but the parent's own `Done When` condition is not yet satisfied
- `blocked` only when the parent is not done, no child item is actively in progress, and remaining completion is waiting on a real blocker such as an unmet dependency, required signoff, or a newly discovered blocker
- `done` only when the parent's own `Done When` condition is satisfied, required validation exists, and required BOSS signoff has been obtained when applicable

A parent item must never remain `todo` once any child item is `in_progress` or `done`.

## Operating Rules

1. Prefer copying from templates over writing framework docs from memory.
2. Preserve repo-specific product content instead of replacing it with generic placeholders.
3. If the target repo already has sufficient systems in place, do not overwrite them mechanically.
4. When existing files are already close to the framework, offer a minimal update plan and then implement only the needed deltas.
5. If a repo is already sufficiently aligned and the user appears to want guidance rather than edits, provide advice on what to update instead of rewriting files.
6. If a repo is borderline between compact and zoned, explicitly evaluate whether migration is warranted before making layout changes.

## New Repo Install Workflow

For a new or lightly scaffolded repo:
1. inspect the top-level structure and package scripts
2. choose compact or zoned mode
3. copy the full template set for that mode
4. replace bracketed placeholders such as `[PROJECT_NAME]`
5. adapt owner-zone names only if the architecture genuinely needs different boundaries
6. keep one stable user-runnable entry point and one validation path
7. summarize which files came directly from templates and which were customized

## Existing Repo Update Workflow

For an existing repo:
1. inspect `AGENTS.md`, `agents/`, docs layout, backlog files, and logging location
2. determine whether the repo already has compact or zoned equivalents
3. if the repo is compact, evaluate whether it should remain compact or move to zoned mode
4. compare existing files against the matching templates
5. preserve stronger repo-specific content where it already satisfies the framework intent
6. patch only the missing framework behaviors, such as planner-owned logging, evidence-first completion, explicit owner-zone handoffs, item-scoped boss-facing signoff instructions in the required numbered format, or explicit parent/child backlog rollup rules
7. do not delete product-specific docs just because the template layout differs
8. if the repo is already sufficiently structured, explain the remaining gaps and offer a narrow update plan

## Advisory-Only Case

If the repo already has:
- a collaboration-only `AGENTS.md`
- planner/coder/evaluator loop docs
- backlog and child-backlog structure
- evidence-first validation guidance
- per-item log location under `logs/backlog-items/`

then treat the repo as sufficiently aligned.

In that case:
- explain which template files correspond to the repo's existing files
- identify only the remaining gaps
- recommend small targeted updates instead of a broad rewrite

## Repo-Specific Content To Preserve

Do not blindly replace:
- product goals
- business rules
- domain rules
- UX specifics
- package scripts
- architecture names that are already coherent in the repo
- backlog item content and IDs

Only replace the framework scaffolding around those things.



