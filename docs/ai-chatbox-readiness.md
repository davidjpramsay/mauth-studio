# AI Chatbox Readiness

This is the practical path from the current Codex-driven workflow to an in-app ChatGPT-like assistant that can inspect and edit Mauth documents directly.

## Goal

The product goal is that the in-app assistant becomes at least as capable for Mauth document work as the current Codex-in-repo workflow. A teacher should eventually be able to ask inside Mauth for the same kind of help currently handled in this thread: create and edit tests, write and repair solutions, adjust student space, build diagrams, fix formatting, inspect print/layout problems, manage files, and update the document safely.

The in-app assistant should not manipulate DOM nodes, local component state, or hidden editor details. It should call explicit Mauth tools, receive structured results, and let the editor commit accepted changes through the same undo, autosave, and file-version system used by human edits.

Parity does not mean giving the model unrestricted browser or filesystem control. It means exposing enough intentional Mauth tools, inspections, validators, repair loops, and document context that the assistant can reach the same result through safer app-native actions.

## Parity Target

The in-app assistant should be treated as the primary AI workflow, not a convenience side panel. It should be able to:

- Understand the current document, selected item, file path, solution visibility state, print mode, page count, and relevant renderer warnings.
- Create complete assessment content: title-page details, questions, parts, subparts, marks, answer spaces, diagrams/charts, worked solutions, mark ticks, and validation passes.
- Make iterative edits from natural language, including "make Q4 harder", "fix this spacing", "add a diagram", "write the solutions", "check every question has enough space", and "combine these two tests".
- Inspect and repair output quality, including missing solutions, insufficient answer space, diagram label issues, page overflows, print/PDF problems, and inconsistent formatting.
- Work with files like a normal project assistant: list, open, save, duplicate, rename, move, delete, restore versions, and eventually search across projects.
- Accept teacher-provided context such as screenshots, pasted images, PDFs, Word documents, curriculum notes, marking requirements, and example questions.
- Use rule brains and deterministic validators as its finishing standard, not vibes or raw text confidence.
- Explain final changes in normal teacher language while hiding raw tool JSON, internal ids, and provider payloads.

## Implemented Baseline

- The Mauth action layer supports deterministic document edits for questions, parts, subparts, modules, solution slots, marks, diagrams, page breaks, front matter, logos, page format, formatting config, and validation.
- Dry-run previews return a proposed document and structured summary before a change is committed.
- The assistant tool layer in `apps/web/src/lib/mauthAssistantTools.ts` exposes the stable tool boundary:
  - `mauth.tools.describe`
  - `mauth.document.inspect`
  - `mauth.validation.run`
  - `mauth.actions.preview`
  - `mauth.actions.apply`
  - `mauth.author.replaceQuestion`
  - `mauth.author.addDiagram`
  - `mauth.author.ensureSolutions`
- The assistant file-tool layer in `apps/web/src/lib/mauthAssistantFileTools.ts` exposes project-file operations:
  - `mauth.files.describe`
  - `mauth.files.list`
  - `mauth.files.open`
  - `mauth.files.save`
  - `mauth.files.saveAs`
  - `mauth.files.createFolder`
  - `mauth.files.duplicate`
  - `mauth.files.rename`
  - `mauth.files.move`
  - `mauth.files.delete`
  - `mauth.files.versions.list`
  - `mauth.files.versions.restore`
- The assistant adapter in `apps/web/src/lib/mauthAssistantAdapter.ts` dispatches document and file tool calls, commits accepted document edits through a host callback, parses opened files through a host callback, serialises current documents for save/save-as, and reports changed ids/paths through plain chat replies.
- `mauth.author.replaceQuestion` is the high-level one-question authoring tool. For focused requests such as "write question 1 with a solution", the provider should use this compact payload instead of manually emitting many low-level module edits. The tool builds question text, optional diagram blocks, optional structured parts, student-only answer space, solution-only solution text, marks, and item order, validates the generated content, applies the update, and lets the adapter commit it through history/autosave.
- Successful high-level authoring calls are terminal in the frontend: after `mauth.author.replaceQuestion`, `mauth.author.addDiagram`, or `mauth.author.ensureSolutions` commits, the chat panel can show the local result message instead of making a second provider call just to say the edit is done. If the tool fails, keep the normal provider repair loop.
- The visible Assistant panel is available only in display-only mode from a small left-side floating toggle. It has a normal chat layout with messages above and the input fixed at the bottom, executes model tool calls through `runMauthAssistantAdapterTool`, commits accepted edits through editor history/autosave, updates active file state for file tools, and hides tool plumbing from the teacher. Do not expose raw tool JSON, internal tool names, ids, or provider payloads in the teacher-facing panel.
- Long assistant runs should show calm teacher-facing activity labels such as Thinking, Inspecting document, Previewing changes, Applying changes, Checking document, Opening file, or Saving file, with a small elapsed timer. These labels are status only; they must not expose tool JSON or require the teacher to manage tool rounds.
- Active-file saves are revision-guarded. The adapter passes the active file path and loaded revision to file tools, and the frontend stores that revision in recovery autosave. Assistant/manual saves must not fetch the latest revision immediately before saving, because that would bypass external-change protection.
- Save and revision friction should be handled by the assistant/API in the background wherever safe. The teacher should not see raw revision numbers, file-tool chatter, or repeated conflict messages. If the current file is dirty before a file open/move/duplicate/rename, save it through the loaded revision first. If a Codex/script/API edit changes the active project file, update the active autosave draft and revision state as part of the same workflow. Ask the teacher only when choosing automatically could lose work, and then offer a concise reload-or-save-as-copy style choice.
- If a provider response reaches the frontend tool-round limit while it still has pending function calls, store that pending `responseId` and tool-call list. A later “continue” message must resume by sending the missing tool outputs for those calls, not by starting a normal user-message request with the pending `previous_response_id`; OpenAI will reject that as a missing function-call output.
- The backend provider boundary is `GET /api/assistant/status` and `POST /api/assistant/chat`. The OpenAI adapter lives in `apps/api/app/services/openai_assistant.py`, uses the Responses API, sends compact rule-brain context from `configs/ai-brains/`, exposes direct high-level authoring tools for common teacher prompts, and keeps the generic `mauth_tool` wrapper for broader document/file tools. Tool calls are mapped back to real Mauth tool names and passed through to the frontend adapter.
- Fresh teacher prompts now use a small brain-menu planner before the authoring call. The planner receives the teacher prompt, a compact document summary, and the available brain menu, then calls `mauth_select_brains` with only the needed packs such as `question`, `diagram`, `solutions`, and `formatting`. The authoring call receives those selected brains rather than the whole rule set. If the planner fails, the backend falls back to deterministic keyword selection so the assistant still works.
- The backend also exposes a direct `mauth_author_replace_question` provider tool for focused one-question writing/replacement. The API maps it back to `mauth.author.replaceQuestion` before the frontend adapter sees it. Prefer this direct high-level tool for prompts like "write Question 1 with a solution" because it avoids the expensive inspect/preview/apply loop for simple authoring.
- The backend also exposes direct `mauth_author_add_diagram` and `mauth_author_ensure_solutions` provider tools. These map back to `mauth.author.addDiagram` and `mauth.author.ensureSolutions`, then commit through the same frontend adapter path. Use them for focused follow-ups such as "add the diagram to Question 1" or "write the solution for Question 1" instead of burning tool rounds on low-level module construction.
- For focused single-question prompts, the backend now exposes only the narrow direct provider tool where possible. For example, "add the diagram to Question 1" exposes `mauth_author_add_diagram` without the broad wrapper tool. This keeps the model on the intended path and reduces token spend.
- `mauth.author.addDiagram` is the placement/replacement tool for focused diagram follow-ups. The assistant should choose a renderer and provide a real `graphConfig`, not a canned diagram recipe. Use Penrose `geometricConstruction` for schematic geometry and circle theorem diagrams; use `graph2d` for coordinate/function graphs, `vector2d` for coordinate vectors, `statsChart` for statistical charts, `setDiagram` for Venn diagrams, `graph3d` for 3D diagrams, and `image` for uploads. `standardDiagram` recipe names are not supported for assistant-authored diagrams.
- For Penrose geometry, the normal assistant path is now native supported Penrose Substance in `graphConfig.options.substanceSource`. The model should choose `geometricConstruction`, receive the compact Diagram Brain/Penrose cheat sheet, then write declarations such as `Point`, `Circle`, `Line`, `NamedSegment` and predicates such as `CircleThrough`, `OnCircle`, `Tangent`, `Segment`, `ParallelToSegment`, and `PerpendicularToSegment`. Structured `graphConfig.data` geometry remains available for simple UI-driven cases, but it is not the primary AI geometry language.
- `mauth.author.ensureSolutions` creates or resizes the matched student answer space and adds solution-only text blocks. It is intended for compact solution tasks where the current document summary already contains enough question text; do not inspect only to confirm ids or module counts.
- Provider context is now focused by request: the backend selects relevant rule brains from `configs/ai-brains/` and filters large document summaries to referenced question numbers where possible. This is intended to improve accuracy first while reducing unnecessary token spend.
- The frontend trims old assistant chat history before a fresh provider request, excluding stale tool-round-limit messages and keeping only recent compact messages. This avoids paying repeatedly for old failed attempts.
- The backend normalises common provider tool-call shape mistakes before the frontend sees them: invalid JSON becomes a structured parse error, nested JSON-string arguments are parsed, action arrays are wrapped as `{ "actions": [...] }`, and unwrapped action/file arguments beside `name` are preserved. This is a safety net only; prompts and tests should still prefer the canonical `mauth_tool` shape `{ "name": "mauth.actions.preview", "arguments": { "actions": [...] } }`.
- Provider HTTP errors should be converted to plain readable messages at the API boundary. Do not surface raw OpenAI JSON, missing-tool-output payloads, or stack-style provider details in the teacher-facing chat panel.
- Before `mauth.actions.preview` or `mauth.actions.apply` reaches the document action engine, the assistant tool boundary validates actual action payload fields. It checks required ids, scopes, placements, patch objects, marks, content block shapes, diagram graph configs, and document-action fields. Diagram validation is type-specific for the supported renderers: `graph2d`, `vector2d`, `graph3d`, `image`, `statsChart`, `geometricConstruction`, `vectorRelationship`, and `setDiagram`. Validation failures return repairable `validationIssues` paths such as `actions[0].blocks[0].lines`, `actions[0].blocks[0].graphConfig.data.chartType`, or `actions[0].patch.graphConfig.metadata.vector2d.vectors[0].components[1]`; no document mutation occurs.
- Assistant-authored answer-space blocks must be student-only, and solution text blocks must be solution-only. The action validator rejects ordinary visible `Solution...` text blocks, answer-space blocks without `visibility: "student"`, and raw `[[marks:...]]` placeholders before preview/apply mutates the document.
- Before `mauth.files.*` tools reach the project-file driver, the assistant file-tool boundary validates file-operation payload fields. It checks required paths/names, file content for save/save-as, multi-path arrays, folder targets, rename/version fields, metadata objects, and revision fields. Validation failures return repairable `validationIssues` paths such as `arguments.path`, `arguments.paths[1]`, or `arguments.content`; no file operation runs.
- The backend reads provider token usage and returns a per-request estimated cost summary. The frontend attaches that summary as a small footer to the assistant reply for the whole teacher prompt, including internal tool-loop calls. Keep pricing tables backend-owned, treat them as estimates, and update them from the official provider pricing page when models change.
- `pnpm eval:assistant:live` runs a small live provider eval for the focused teacher prompt "write Question 1 with a circle-geometry proof and solution". `pnpm eval:assistant:live:all` covers representative focused cases: writing a circle-geometry question, adding the standard circle/tangent diagram, writing a multipart probability question, and ensuring a solution. These are paid real-provider checks, so use them deliberately.
- Provider keys are backend-only. Put `OPENAI_API_KEY` in the repo-root `.env` or `apps/api/.env`; do not expose it through Vite/frontend environment variables. `OPENAI_MODEL` is optional.
- `pnpm test:web-actions` covers the action engine and assistant tool dispatcher.

## Required Chatbox Loop

1. Load the relevant brains for the request: question, formatting, diagram, and/or solutions.
2. Use focused high-level tools when they fit the request: `mauth.author.replaceQuestion` for one-question writing, `mauth.author.addDiagram` for diagram follow-ups, and `mauth.author.ensureSolutions` for compact solution-writing tasks.
3. Call `mauth.document.inspect` before broader edits or whenever the current compact summary lacks enough context.
4. For broader edits, generate an atomic batch of structured Mauth actions.
5. Call `mauth.actions.preview`.
6. If the preview fails, repair the action batch rather than patching raw state.
7. For solution/test-generation work, call `mauth.validation.run`.
8. Call `mauth.actions.apply` only after the preview and validation are acceptable.
9. Commit the returned document through editor history/autosave.
10. Report what changed using ids, counts, and validation status.

The in-app chatbox UI/provider adapter must call `runMauthAssistantAdapterTool`. The lower-level document/file tools remain useful for tests and specialised workflows, but the adapter is the normal boundary because it owns the handoff from tool results to host editor/file callbacks. Provider tool calls should translate to this adapter path, not introduce a second editing path.

## Useful Next Tool Gaps

- Expand renderer-specific diagram schema guidance and validation, especially common circle geometry, trigonometry, coordinate geometry, probability trees, box plots, and normal/binomial distribution diagrams. The goal is intelligent renderer choice plus validated graphConfig payloads, not a growing list of one-off canned diagram names.
- Expand diagram-type-specific validation into renderer feedback and repair. Current action validation catches malformed diagram payload fields before preview/apply reaches the renderer, but it does not inspect final visual output, label collisions, bad graph extents, Penrose optimisation failures, or Plotly/JSXGraph rendered screenshots.
- Attachment intake for pasted/dropped screenshots and source files. Current chat is text/tool-call only; PDFs, Word documents, images, and screenshots need an explicit upload pipeline, content extraction, provider consent, and a safe tool result format before the assistant can use them directly.
- A richer document inspector that can return the selected question/module subtree, surrounding context, marks, solution slots, diagrams, and relevant file metadata when the user asks about a specific part of the test.
- A renderer inspection tool for page/fit problems: page count, page occupancy, overflows, selected-anchor bounding boxes, solution-slot fit, print visibility state, and browser print mode assumptions.
- A diagram inspection and repair tool that can return structured renderer output for JSXGraph, Penrose, Plotly, image blocks, and 3D diagrams, then apply targeted diagram patches without hand-editing full graph JSON.
- Attachment intake for pasted/dropped images, screenshots, PDFs, Word documents, and curriculum snippets, with explicit teacher consent before sending their content to a provider.
- Streaming progress for provider responses and long tool chains, with calm labels such as Thinking, Inspecting document, Applying changes, Checking solutions, and a working timer.
- Better continuation and recovery: resumable tool loops, stale-response cleanup, retry/repair after provider errors, and the ability to continue large edits without losing context or duplicating work.
- Tool-level access to saved project search, question search, and eventually a question bank/curriculum bank, without exposing raw filesystem paths to the model.
- Visible provider settings/status beyond the current backend `.env` setup, with no silent document upload.

## Parity Roadmap

1. Harden the current chat loop: progress labels, robust continuation, clean provider errors, schema validation, retry/repair loops, and usage/cost summaries.
2. Make document inspection closer to what Codex sees: selected item, nearby modules, document structure, rendered page metrics, validation state, and file state in one compact tool result.
3. Add renderer tools: page/layout inspection, solution-slot fit inspection, diagram screenshot/metadata inspection, and print/PDF-specific checks.
4. Add attachment tools: pasted images/screenshots first, then PDFs/Word/source documents, all routed through backend-owned provider calls and explicit user intent.
5. Add high-level authoring tools for common teacher prompts: write all solutions, repair all solution spaces, add more diagram families, layout pass, print check, combine tests, and generate marking key. The current focused examples are `mauth.author.replaceQuestion`, `mauth.author.addDiagram`, and `mauth.author.ensureSolutions`.
6. Add project-level intelligence: search files, compare tests, duplicate/rename/move safely, and later integrate question-bank and curriculum-bank retrieval.
7. Add an evaluation set: saved tests and prompts that compare in-app assistant outcomes against expected document changes, validation status, visual screenshots, and print behaviour.

## Guardrails

- The chatbox should prefer actions over raw JSON mutation whenever an action exists.
- Raw document patches are acceptable only as a temporary development fallback and should become a new Mauth action if repeated.
- Mauth actions and solution validation should stay background systems. Teachers should interact with plain chat, normal editor controls, and understandable activity summaries rather than raw action JSON or validation-control buttons.
- AI-created tests should include generous student space, concise solutions, mark ticks, and validation.
- Student-space blocks should remain the replaceable surface for solution copies; ordinary question modules should be shared between student and solution output.
- File operations must use the project/file API, not browser cache or local component state.
- File saves must use the loaded `baseRevision`; on conflict, ask the teacher to reload or save as a copy rather than overwriting disk changes.
- Keep file/revision/autosave status quiet. Show short, human messages for completed work; do not expose raw file-tool JSON, revision plumbing, or repeated autosave notices to the teacher.
- External LLM use needs explicit provider settings, backend-only API keys, visible model/action logs, and clear user control over what content is sent.
