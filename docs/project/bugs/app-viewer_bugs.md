# Bug Tracker: app-viewer

Bug IDs use the `ALV-B<NNN>` format. This file covers the `app-viewer` zone only. Agents should load this file only when the active task involves a bug in this zone.

The full planner-coder-evaluator loop applies. The Backlog Gate applies: a bug item must exist before the fix is written.

| ID | Status | Owner Zone | Bug | Write Scope | Repro | Done When | Validation | Fix Commit | BOSS Signoff | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALV-B001 | open | board-view | Board navigation loses board context on back: clicking into a backlog item from the board then pressing back returns to the project tile view instead of the board | `apps/agent-log-viewer/src/App.tsx` | Open board view; click any card to enter item detail; press back — observe return destination | Back navigation from item detail returns to board view, not project tile view; board scroll position and selected card state are preserved | Local app interaction; verify back from item detail lands on board with prior state intact | — | no | Back-navigation handler restores `view: 'board'` instead of popping to project tile view |
