# Client Spec

The bundled viewer under `apps/agent-log-viewer/` helps inspect logs, review validation evidence, and support boss-facing signoff workflows without becoming the source of truth for the plugin or template rules.

The viewer should remain a companion surface:
- useful for inspection and review
- separate from plugin metadata and template policy
- evolvable without redefining the framework itself
