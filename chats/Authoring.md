# Authoring

Purpose: use Mauth to create, inspect, convert, and polish mathematics assessments.

Start here for teacher-facing tasks: write questions, convert source material, improve diagrams, check layout, write solutions, adjust answer spaces, and verify print readiness.

Repository context, when a source checkout is available:

1. Read `AGENTS.md`.
2. Read `docs/current-state.md`.
3. Read `docs/local-ai-workflow.md`.
4. Read `docs/agent-bridge.md`.
5. Use `workspace/` for source crops, screenshots, temporary PDFs, and generated reports.
6. Prefer the installed app's MCP tools. A source checkout is not required for normal authoring.
7. Do not edit raw project JSON as the normal authoring path. Use direct `storage/` edits only for recovery or deliberate migration, and keep revisions/autosave aligned.
8. Do not modify app source unless the authoring workflow exposes an app bug or missing capability.

Default posture: inspect first, make revision-safe structured edits, validate, and verify the rendered result.
