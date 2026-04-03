# Product Spec

## Purpose

This document defines the product behavior and release scope for AgentLogViewer.

Use this file for product intent, operator-facing requirements, release boundaries, and the acceptance frame for the first useful slice.

See related docs:
- `docs/architecture.md` for system boundaries and contracts
- `docs/ui-spec.md` for the dashboard layout and interaction rules

## Product Summary

AgentLogViewer is a browser-based dashboard for reviewing multi-agent development activity across multiple tracked projects.

The default search root is `C:\work`. The system must also support a configured list of project roots. Each tracked project is a direct child directory of one of those roots.

A project is considered trackable when it contains:

- `.\docs\backlog.md`

It may also contain:

- `.\logs\`

The main purpose of the product is to help a user understand the status of all tracked projects without opening each repository and reading raw markdown or NDJSON by hand.

The dashboard should update automatically as source files change over time.

## Product Goals

- Show all tracked projects in one dashboard.
- Summarize backlog status in a way that is comparable across projects.
- Surface current work, blockers, and likely next user actions from agent logs.
- Give the user direct access to the main project framework files that the UI renders from.
- Present the information in a clean, modern, tile-based web UI that supports drill-in exploration.

## Non-Goals For Initial Release

- editing backlog files from the viewer
- editing logs from the viewer
- multi-user collaboration
- remote project discovery outside configured local roots
- AI-generated summaries that invent information not present in source files

## Trackable Project Rules

A project root is a configured absolute directory, with `C:\work` as the default.

Each project is a direct subdirectory of a configured root.

A project is trackable when:

- `<project>\docs\backlog.md` exists

Optional supplemental files may exist and should be used when present:

- `<project>\logs\...`
- `<project>\docs\spec.md`
- `<project>\docs\architecture.md`
- `<project>\AGENTS.md`

Representative source material already exists under `C:\work`, including `C:\work\MultiTacToe`, this repository, and other sibling projects with backlog files.

## Backlog Requirements

The system must ingest project backlogs from markdown tables in `docs/backlog.md`.

The backlog tables will generally expose columns equivalent to:

| ID | Status | Owner Zone | Item | Write Scope | Depends On | Done When | Validation | BOSS Signoff | Notes |

Different projects may use different column labels. Semantically identical columns should be treated as the same logical field when possible.

The first slice must at minimum normalize:

- item id
- status
- owner zone
- item title
- notes

The first slice should preserve unrecognized columns rather than discarding them.

## Log Requirements

Projects may contain item-oriented agent logs under `.\logs`.

Sample log lines may vary by project, but v1 assumes newline-delimited JSON records similar to:

```json
{"ts":"2026-04-01T15:57:56.789931Z","item":"MTT-006","agent":"evaluator_agent","event":"evaluation","step_verdict":"pass","item_status":"blocked","summary":"The docs now define move input shape, rejection conditions, accepted result shape, turn advancement, draw handling, and legal/illegal move examples. Closure is gated only by BOSS signoff on the v1 move-resolution semantics.","next_gap":"Obtain BOSS signoff on the move-resolution and turn-transition semantics."}
```

The viewer must expose a human-interpretable presentation of these logs, including when available:

- current step
- blockers
- next gap or next action
- agent responsible
- status or verdict signal

The source log remains read-only.

The implementation should be validated against representative real project data already present under `C:\work`, not only invented examples.

## Required First-Slice Views

## Refresh Requirements

- The app should update automatically when tracked backlog, docs, or log files change.
- The primary refresh mechanism should be filesystem-backed change detection on the local machine.
- The app may retain a low-frequency reconciliation poll as a fallback when watchers are unavailable or need recovery.
- The client should distinguish among live watcher mode, polling fallback, and reconnecting SSE transport so the refresh indicator does not claim live updates when watchers are degraded.
- Refresh should re-read project, backlog, and log data without requiring a manual page reload.
- Refresh should update changed data in place rather than forcing a full-screen redraw.
- Refresh must preserve the current application state when that state is still valid.
- Preserved state includes the selected project, active detail surface, selected framework document, active filters, search text, grouping mode, and scroll context.
- Refresh may change selection or clear state only when the current target no longer exists after the refresh or is otherwise no longer valid.
- Refresh should update only the affected data regions when possible.
- Refresh should not cause a full-screen redraw or reset the user's current drill-in context.
- If the user is viewing a project detail page, the app should preserve the current selection unless the underlying item no longer exists.
- The user should not need to think about polling cadence during normal operation.

### Portfolio Dashboard

The main view is a tile-based dashboard showing all tracked projects.

Each tile should show at least:

- project name
- project root
- count of backlog items grouped by state
- whether logs are present
- a concise indicator of active blockers or items needing attention

### Project Detail

The user must be able to drill into a project tile and view:

- normalized backlog items
- grouped backlog status
- a human-readable log view for relevant items
- direct access to the primary project framework files rendered in the app rather than raw markdown download links

### Framework File Access

The user should have direct access to the main framework files for each project that the application considers important context, such as:

- `AGENTS.md`
- `docs/spec.md`
- `docs/architecture.md`
- `docs/backlog.md`

The product should render these files in-app in a readable form.

## Acceptance Frame For First Useful Slice

The first slice is acceptable when:

- the app discovers trackable projects under `C:\work` by default
- the app supports a configured list of project roots
- the app updates automatically when tracked files change
- each discovered project shows backlog item counts grouped by normalized status
- a user can drill from a project tile into backlog and log details
- log entries are rendered into a readable status-oriented view rather than only raw NDJSON
- the main framework files for a project can be opened directly in the app
- refresh updates visible data without forcing a full-screen redraw
- the UI is visually clean and modern enough to function as a daily overview tool

## Open Product Decisions

- whether v1 supports recursive search deeper than one directory below a configured root
- how aggressively semantic column normalization should infer equivalence
- how the app chooses the most relevant logs when a project has multiple log files
