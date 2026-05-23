# UI Spec

## Purpose

Define the required presentation and interaction model for the first browser UI of AgentLogViewer.

## Visual Direction

- The main view should feel like a modern operations dashboard, not a raw file browser.
- The design should be clean, calm, and easy to scan under repeated daily use.
- Summary information should be visually prioritized over raw source detail.

## Main View

The main view is a tile-based system showing all tracked projects.

Each project tile should show:

- project name
- root path or root label
- total backlog items
- grouped counts by normalized state
- whether logs are present
- an at-a-glance attention signal when blockers or stalled work exist

The tile should provide a clear drill-in affordance.

## Project Detail View

When a user drills into a project, the app should provide at least these surfaces:

- backlog summary
- normalized backlog item view
- human-readable log view
- framework file viewer

The detail layout may use tabs or a split-panel arrangement, but it should keep navigation obvious and avoid making the user hunt for core project context.

## Backlog Presentation

- Show normalized backlog rows in a readable table or list.
- Grouped status totals should remain visible near the top of the project detail view.
- Rows needing attention, such as `blocked` items, should stand out clearly.
- Preserve important source information such as item id and notes.

## Log Presentation

- Logs should not be shown only as raw NDJSON by default.
- The app should render each log entry into a readable summary row or card.
- The presentation should surface current step, blocker signals, verdicts, and next gap or next action when present.
- Raw log content may be available as a secondary detail view.

## Framework File Viewer

- The user should be able to open the main framework files for a project directly in the app.
- Files should be rendered for readability rather than exposed only as download links.
- `docs/backlog.md` is required; `AGENTS.md`, `docs/spec.md`, and `docs/architecture.md` should be shown when present.

## Interaction Rules

- From the dashboard, one interaction should open a project detail view.
- From project detail, one interaction should open a backlog item or related log context.
- Selection and navigation state should remain understandable when switching between backlog, logs, and framework files.
- Live updates should appear promptly after tracked files change, without the user waiting on a fixed polling interval.
- The header refresh indicator should show when the app has degraded to polling fallback instead of filesystem-backed live watching.
- Automatic refresh must not switch the user between backlog, logs, or framework views.
- Automatic refresh must not reset filters, search terms, grouping, selected framework tabs, or project selection unless the currently selected entity disappears or becomes invalid.
- Empty states should distinguish among:
  - no tracked projects found
  - project has no logs
  - project has logs but no readable entries

## Backlog Board View

The board view is a full-screen graphical display of a project's backlog, triggered from the project tile on the portfolio dashboard.

For the complete board specification — entry point, layout, swimlane structure, card design, connector lines, click-to-highlight interaction, and validation overlay — see [`docs/board-spec.md`](./board-spec.md).

## Responsive Rule

- v1 is desktop-first.
- On narrower layouts, tiles may collapse to fewer columns and detail panels may stack vertically.
- The drill-in flow must remain usable without relying on hover-only interactions.
