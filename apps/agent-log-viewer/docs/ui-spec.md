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

When a user selects a project, they may switch to a graphical backlog board view in addition to the existing table view.

### Layout

- Use swimlanes, one per owner zone, arranged vertically.
- Within each swimlane, arrange backlog item cards horizontally in backlog order.
- Completed items are visually subdued (reduced opacity or muted colors) relative to active items.
- The view automatically scrolls to the first non-completed item in the backlog on load.

### Card Content

Each backlog item card must show:
- item ID and title (item description)
- status — with a distinct color or badge per state (`todo`, `in_progress`, `blocked`, `done`)
- owner zone (implicit from swimlane, but also shown on the card)
- dependencies — listed by ID, with visual indicators when a dependency is incomplete
- notes when present

Each card should feel modern and scannable: clear hierarchy between the ID/title and the secondary fields, comfortable padding, and enough contrast to distinguish states at a glance.

### Dependency Visualization

- Dependency IDs on each card should be visually distinct (e.g., badge or chip).
- If a dependency is not yet `done`, the chip should signal that (e.g., amber color or an incomplete indicator).
- Full dependency graph lines are not required in v1 — per-card chips are sufficient.

### Validation Instructions (Deferred)

- For `done` items, if validation instructions are present in the source backlog, they should be expandable on the card.
- This is not required in the first implementation of the board view. Track as a follow-on item.

### Interaction Rules

- The board view is an alternative to the existing table-based backlog view, not a replacement.
- A toggle or tab in the project detail view switches between table and board.
- Selecting a card may open the same item detail or log context as the table row equivalent.
- Auto-scroll to the first non-completed item happens on initial load and on each refresh that does not change the user's current scroll position intentionally.

## Responsive Rule

- v1 is desktop-first.
- On narrower layouts, tiles may collapse to fewer columns and detail panels may stack vertically.
- The drill-in flow must remain usable without relying on hover-only interactions.
