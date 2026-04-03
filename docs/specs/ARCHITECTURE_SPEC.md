# Architecture Spec

Major technical boundaries:
- plugin metadata and skills at repo root
- shipped compact and zoned templates under `templates/`
- cross-platform transport scripts under `scripts/`
- bundled companion app under `apps/agent-log-viewer/`

The plugin remains usable on its own, but the bundled viewer provides an adjacent UI for reviewing logs, evidence, and signoff-oriented workflows.
