# Architecture Spec

## Purpose

This document defines the system boundaries and contracts that implementation must respect.

This is not a UI mood-board document. It exists to keep project discovery, backlog ingestion, log interpretation, and presentation cleanly separated.

## Top-Level Boundaries

The project is divided into four primary layers:

- discovery/domain
- application
- infrastructure
- client

## Discovery And Domain Layer

This layer is the authoritative source of normalized project data.

It owns:

- project discovery under configured roots
- trackable-project eligibility rules
- backlog table extraction
- semantic column normalization
- log record normalization
- derived status summaries used by the UI

It must not own:

- React component state
- browser-only interaction details
- filesystem watchers tied directly to rendering

### Project Discovery Contract

Configured input:

```ts
type ViewerConfig = {
  projectRoots: string[]; // defaults to ['C:\\work']
};
```

Discovery rules for v1:

- each configured root is an absolute directory
- each direct child directory of a root is a candidate project
- a candidate project becomes trackable when `<project>/docs/backlog.md` exists

### Normalized Project Contract

```ts
type TrackedProjectV1 = {
  id: string;
  name: string;
  rootPath: string;
  docsPath: string;
  backlogPath: string;
  logsPath: string | null;
  frameworkFiles: {
    agents: string | null;
    spec: string | null;
    architecture: string | null;
    backlog: string;
  };
  backlogSummary: BacklogSummaryV1;
};
```

### Normalized Backlog Contract

Backlog rows originate from markdown tables but should be normalized into a stable contract.

```ts
type BacklogStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'unknown';

type BacklogItemV1 = {
  id: string;
  status: BacklogStatus;
  ownerZone: string | null;
  title: string;
  writeScope: string | null;
  dependsOn: string | null;
  doneWhen: string | null;
  validation: string | null;
  bossSignoff: string | null;
  notes: string | null;
  extraFields: Record<string, string>;
};

type BacklogSummaryV1 = {
  countsByStatus: Record<BacklogStatus, number>;
  totalItems: number;
};
```

Column normalization rules for v1:

- treat exact known columns as canonical when present
- treat semantically identical columns as the same field when confidently identifiable
- preserve original column text for unknown columns in `extraFields`
- do not fail the whole project because one optional column is missing

### Normalized Log Contract

Projects may store NDJSON logs with slightly different shapes. The system should normalize the common fields used by the UI.

```ts
type ProjectLogEntryV1 = {
  id: string;
  ts: string | null;
  itemId: string | null;
  agent: string | null;
  event: string | null;
  stepVerdict: string | null;
  itemStatus: string | null;
  summary: string | null;
  nextGap: string | null;
  raw: string;
  sourcePath: string;
};
```

The first slice must preserve the raw source line and expose normalized values when available.

## Application Layer

The application layer orchestrates the viewing session.

It owns:

- loading config and project roots
- refreshing discovered projects
- selecting the active project
- selecting the active backlog item or log view
- deriving project tile data
- mapping normalized logs into human-readable status cards or timeline rows
- handling in-app framework file viewing

It must not:

- redefine discovery or parsing semantics
- bury canonical normalized data inside UI-only structures

### Refresh Contract

The application layer owns refresh behavior and state preservation.

v1 refresh rules:

- consume watcher-driven invalidation signals from infrastructure for tracked roots, projects, docs, and logs
- re-read discovered projects, backlog files, and log files through infrastructure adapters when a relevant change is reported
- use a low-frequency reconciliation poll only as a fallback or recovery mechanism
- treat watcher health as separate from SSE transport health so the UI can enter polling fallback when the connection stays open but filesystem watching is degraded
- merge refreshed data into the current application state incrementally when possible
- preserve active route, selected project, active detail surface, selected framework file, filters, search text, grouping state, and selected item when those entities still exist
- treat refresh as a data update only; it must not behave like navigation
- only clear or replace UI state when the current selection becomes invalid after the refreshed data is applied
- avoid full-screen remounts or redraws for unchanged regions

## Infrastructure Layer

The infrastructure layer owns environment-specific IO.

It owns:

- directory enumeration
- file reads
- markdown file loading
- NDJSON file loading
- filesystem-backed change watching for tracked roots and tracked project subtrees
- fallback polling or reconciliation reads when watcher state is unavailable or suspect

Infrastructure should expose refresh-friendly reads so the application layer can update changed data without forcing a full UI reset.

It must not:

- decide product semantics
- contain rendering logic

## Client Layer

The client layer is the browser-facing presentation and interaction surface.

It owns:

- project tiles
- status summaries
- backlog tables and item detail views
- human-readable log presentation
- framework file rendering
- filtering and drill-in controls

It must not:

- become the source of truth for normalized projects, backlog rows, or log entries
- silently reinterpret files with rules not declared in the domain contracts

## Determinism And Testability

The architecture should support:

- deterministic discovery tests over sample project trees
- parser tests for backlog-table normalization
- parser tests for representative NDJSON log variants
- application tests for dashboard summaries and drill-in behavior
