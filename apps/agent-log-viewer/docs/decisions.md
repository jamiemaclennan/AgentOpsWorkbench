# Decisions

## Purpose

Record intent-sensitive product and architecture decisions that should not be rediscovered later.

## Template

### DEC-XXX Title

- Date:
- Status: proposed | accepted | superseded
- Context:
- Decision:
- Rationale:
- Consequences:

## Live Decisions

### DEC-001 First slice is local-file based

- Date: 2026-04-01
- Status: accepted
- Context: The project needs a narrow initial scope that is easy to validate and does not require backend setup.
- Decision: The first implementation slice reads local log files and does not include remote log transport.
- Rationale: This keeps parsing and viewer behavior testable before network or auth concerns are introduced.
- Consequences: Remote source support, syncing, and multi-user access remain follow-on work.
