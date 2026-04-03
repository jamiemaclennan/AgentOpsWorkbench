# Backlog

This file is the canonical short-term work tracker for AgentLogViewer.

## Rules

- Keep the backlog focused on product-defining work.
- Do not create bootstrap-only items once the scaffold exists.
- Every item must have a falsifiable `Done When`.
- Prefer a small number of meaningful items over many bookkeeping items.

Status values:
- `todo`
- `in_progress`
- `blocked`
- `done`

Owner zones:
- `domain`
- `application`
- `client-web`
- `tooling`

## Active Backlog

| ID | Status | Owner Zone | Item | Write Scope | Depends On | Done When | Validation | BOSS Signoff | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALV-001 | done | domain | Lock the normalized project, backlog, and log contracts for cross-project viewing | `docs/spec.md`, `docs/architecture.md`, `server/index.ts`, `src/shared/types.ts` | None | The docs and implementation define project discovery under configurable roots, backlog column normalization, and the common log fields the UI depends on clearly enough that implementation can proceed without inventing semantics. | Spec review against real project inputs plus implementation review. | yes | Implemented with configurable roots, normalized backlog rows, and normalized log entries. |
| ALV-002 | done | application | Define dashboard and drill-in session behavior | `docs/spec.md`, `docs/architecture.md`, `docs/ui-spec.md`, `src/App.tsx` | ALV-001 | The docs and app define how the app moves between portfolio dashboard, project detail, backlog view, log view, and framework file view, including the default root behavior and configured-root support. | Cross-doc review plus local app build. | no | Implemented with project selection, polling refresh, drill-in, and in-app framework rendering. |
| ALV-003 | done | client-web | Lock the first tile-based dashboard and human-readable log presentation | `docs/ui-spec.md`, `src/App.tsx`, `src/styles.css` | ALV-001, ALV-002 | The UI defines the information shown on project tiles, attention signals, project detail layouts, and readable log presentation with stable filters and groupings. | UX review plus local app build. | yes | Implemented, with stable drill-in, readable logs, instruction-aware backlog rows, and current layout refinements landed. |
| ALV-004 | in_progress | tooling | Define representative real project inputs for parser and dashboard development | `docs/sdlc.md`, `docs/architecture.md`, `server/index.ts` | ALV-001 | The docs and implementation name existing projects under `C:\work` as representative input sources and use those real backlog/log shapes during development. | Doc review with named project references plus parser checks against local repos. | no | Grounded in `C:\work\MultiTacToe`, this repo, and other sibling projects with backlogs. |
| ALV-005 | in_progress | infrastructure | Replace interval polling with filesystem-backed change detection for tracked project files | `docs/spec.md`, `docs/architecture.md`, `server/index.ts` | ALV-001, ALV-002, ALV-004 | The server watches tracked project backlog, docs, and log directories on Windows and emits refresh signals when relevant files change, so the app no longer depends on a fixed 60-second polling interval for normal updates. | Local verification against multiple real projects with edits to backlog and log files plus implementation review. | yes | SSE-backed watcher sessions are in place; remaining work is hardening and validation across more real repos. |
| ALV-006 | in_progress | application | Introduce watcher-driven client refresh with safe fallback and invalidation rules | `docs/spec.md`, `docs/architecture.md`, `docs/ui-spec.md`, `src/App.tsx`, `src/api.ts` | ALV-005 | The client consumes watcher-driven change notifications, updates affected project data in place, preserves current selection and filters, and falls back to manual or low-frequency refresh when the watcher becomes unavailable. | Local app build plus interaction checks that current mode, selected project, filters, framework tab, and scroll context are preserved across watcher updates. | yes | EventSource-driven refresh is wired with a slower reconciliation timer; remaining work is validation and any watcher edge-case fixes. |
