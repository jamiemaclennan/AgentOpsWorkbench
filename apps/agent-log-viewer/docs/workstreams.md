# Workstreams

## Purpose

Define the owner zones and coordination boundaries for AgentLogViewer.

## Owner Zones

### `docs`

- product scope
- architecture notes
- backlog and milestone maintenance
- decision logging

### `domain`

- record contracts
- parsing rules
- normalization logic
- grouping and filter semantics

### `application`

- source loading orchestration
- refresh behavior
- selection and filter state management

### `client-web`

- list and detail rendering
- filter controls
- status states
- layout and styling

### `tooling`

- test strategy
- fixtures
- scripts and developer workflow

## Coordination Rules

- Domain owns canonical record meaning.
- Application owns session flow and derived viewing state.
- Client-web owns presentation only.
- Docs owns backlog clarity and cross-document consistency.
- Tooling owns repeatable validation, not product semantics.
