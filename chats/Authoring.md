# Authoring

Purpose: use Mauth to create, inspect, convert, and polish mathematics assessments.

Start here for teacher-facing tasks: write questions, convert source material, improve diagrams, check layout, write solutions, adjust answer spaces, and verify print readiness.

Required context:

1. Read `AGENTS.md`.
2. Read `docs/local-ai-workflow.md`.
3. Read `docs/agent-bridge.md`.
4. Use `workspace/` for source crops, screenshots, temporary PDFs, and generated reports.
5. Prefer the local agent bridge when available; otherwise use structured document actions, project-file APIs, browser preview evidence, and validation output over hidden UI assumptions.
6. Do not edit raw project JSON as the normal authoring path. Use direct `storage/` edits only for recovery or deliberate migration, and keep revisions/autosave aligned.
7. Do not modify app source unless the authoring workflow exposes an app bug or missing capability.

Default posture: produce useful assessment material and clear verification evidence.
