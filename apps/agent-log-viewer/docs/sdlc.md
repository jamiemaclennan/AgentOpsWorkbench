# SDLC

## Purpose

Define the minimum delivery process for AgentLogViewer while the project is still small.

## Working Rules

- Specs and backlog should be updated before implementation changes the intended behavior.
- Work should begin from a backlog item with falsifiable completion criteria.
- Prefer small slices that can be evaluated independently.
- Keep parsing and normalization behavior covered by deterministic examples.
- Do not treat manual spot checks as a substitute for repeatable validation where tests are practical.

## Change Flow

1. Clarify or create the backlog item.
2. Update the relevant spec when behavior or scope changes.
3. Implement the smallest useful step.
4. Run the narrowest useful validation for that step.
5. Record follow-on work explicitly instead of widening scope silently.

## Validation Expectations

- Parser behavior should have unit-level coverage around accepted, malformed, and edge-case inputs.
- Application flow should have tests or deterministic review evidence for load, filter, and selection behavior.
- The client should have smoke coverage for loading, empty, populated, and error states.
- User-facing design changes should include concise review steps when BOSS signoff is required.

## Representative Project Inputs

This project already has representative source material under `C:\work`.

Primary references include:

- `C:\work\MultiTacToe`
- `C:\work\AgentLogViewer`
- other sibling projects under `C:\work` that contain `docs/backlog.md`

When implementation or validation refers to representative inputs, it means using real backlog and log shapes from those projects, such as:

- an actual project directory layout
- an actual `docs/backlog.md` markdown table
- an actual `logs` file with representative NDJSON entries

These references exist to keep parsing and UI work grounded in real source shapes rather than vague descriptions.
