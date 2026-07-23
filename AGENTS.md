# Mauth Studio Agent Guide

Mauth Studio is a rule-driven high-school mathematics assessment authoring system. Keep the layers separate:

- SymPy/FastAPI maths services live in `apps/api/app/services`.
- Question generation lives in `packages/question-engine` and `configs/question-types`.
- Marking rules live in `packages/marking-engine` and `configs/marking`.
- Formatting rules live in `packages/formatting-engine` and `configs/formatting`.
- Rendering adapters live in `apps/web/src/components`, `packages/diagram-penrose`, and `packages/diagram-plotly`.

Do not put marking or formatting decisions inside question generator logic.

Product direction: build for Codex/Claude-style external agent authoring first. Human UI should remain usable and clear, but new features, schemas, editor actions, validation, and docs should assume an AI agent will often create, inspect, and edit the document through a structured local agent bridge, Mauth actions, and browser verification. Prefer explicit document state, deterministic validators, reversible actions, stable labels, and small focused controls over UI-only behaviour that an agent cannot reason about or reproduce.

The old provider-backed chat panel is not the product path. Treat this file plus `docs/current-state.md`, `docs/architecture.md`, `docs/local-ai-workflow.md`, `docs/agent-bridge.md`, `docs/mauth-actions.md`, and `docs/ai-brains.md` as the operating contract for external/local agents such as Codex, Cursor, and Claude Code.

At the start of a new model or development session, read `docs/current-state.md` before editing. It contains the resumable worktree checkpoint and distinguishes completed work from partially started work. Verify it against `git status`, the current branch, and the relevant source before relying on it. When a change affects runtime, storage, document lifecycle, bridge behavior, architecture, or product direction, update that handoff file in the same change.

## Commands

Run root scripts from the project root: the folder containing this `AGENTS.md`, the root `package.json`, `apps/`, and `packages/`.

Install dependencies from the project root:

```bash
pnpm install
cd apps/api
uv sync
cd ../..
```

For normal macOS use, open the installed standalone app:

```bash
open ~/Applications/Mauth\ Studio.app
```

Build and install it from the project root with:

```bash
pnpm macos:build
pnpm macos:install
```

The standalone app owns its dynamic local API port and child service; no Terminal windows need to remain open. Release builds include a self-contained MCP connector under the app's `Contents/Resources/agent` directory. **Help > Set Up Codex or Claude…** exposes one-time client setup commands without exposing the token. Repository commands such as `pnpm agent:doctor`, `pnpm agent:mcp`, and `pnpm smoke:agent-connector` remain development and diagnostics tools. Both connector paths discover a running app through its private runtime manifest. The packaged bridge is authenticated with a random per-launch token stored only in that mode-`0600` manifest; do not print, persist, or copy the token into source files. Use `pnpm macos:dev` for the Electron development shell. It owns separate dynamic API and Vite ports: React/CSS edits use Vite HMR and watched API source reloads through Uvicorn, while edits to Electron main-process or packaging files require restarting `pnpm macos:dev`. `pnpm dev:status` reports either a running packaged app or the fixed-port development runtime. `pnpm dev:stop` stops only fixed-port development servers; quit the packaged app normally with Command-Q or **Mauth Studio > Quit Mauth Studio**.

External macOS distribution uses the guarded `pnpm macos:ship` workflow and the credential/setup contract in `docs/macos-release.md`. `pnpm macos:release` only builds and verifies the local signed/notarized artifacts. Never treat an ad-hoc-signed local build as a shareable release.

During normal implementation, use `pnpm macos:dev`; signing, notarization, and publication are not part of the edit-test loop. Use `pnpm macos:build` plus `pnpm macos:install` only for deliberate local installed-app checkpoints. Use `pnpm macos:release` only to inspect a versioned release bundle. Use `pnpm macos:ship` only from clean, pushed `main` when publishing a new version for another person. Do not rerun either release pipeline after every small source change.

For lower-level API/web debugging, run locally from the project root using two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

If the terminal is already inside `apps/web`, use `pnpm dev` instead of `pnpm dev:web`.

Quality gate before commits:

```bash
pnpm check
```

This runs Prettier, ESLint, Ruff, pytest, TypeScript, and the Vite build.

Before handing this dirty worktree to another model, run:

```bash
pnpm check:handoff:live
```

The ordinary `pnpm check:handoff` validates the durable documentation contract and is part of `pnpm check`. The live variant additionally verifies the branch/baseline when pinned, the documented clean-or-dirty worktree state, and key source line counts in `docs/current-state.md`. A clean committed checkpoint may use `CURRENT` and `HEAD`; a dirty transition checkpoint must record exact counts. Keep the live check as a transition gate rather than a day-to-day gate because those facts legitimately change during an implementation slice.

## Storage And Git Hygiene

Do not commit local authoring data or generated output:

- `storage/`
- `drafts/`
- `tmp/`
- `workspace/` generated artifacts
- `node_modules/`
- `apps/web/dist/`
- Python caches and virtual environments

The app stores authored documents as visible local files under `~/Documents/Mauth/Documents` by default or another teacher-selected folder. New structured documents use the `.mauth` extension and contain versioned JSON with `format: "mauth-studio-document"`; `.test.json` remains read-compatible but is not the default for new saves. `.mauth.md` is the separate text-based Mauthdown exchange format. Preserve an existing file's extension during ordinary saves, renames, and duplicates rather than silently migrating teacher files. On macOS, shared app state, autosave, reusable logo assets, and remembered-folder identity live under `~/Library/Application Support/Mauth Studio/storage`; project metadata and versions for a selected external folder live in that folder's `.mauth` directory. Browser localStorage is only a fallback cache. Treat both the visible workspace and legacy `storage/` as user data, not source code. Logos are not built in: starter logos are editable seed data added once for new or migrated browsers, and the shared logo library is independent of any one saved test. Project/file storage uses revision-aware saves and version snapshots. The Files drawer ZIP backup/import path is the supported portable backup workflow. Treat legacy `storage/tests` as migration input only, while the active state root's `autosave/current-test.json` is recovery state and should not be confused with a saved file.

External or cloud-backed documents folders can disappear temporarily. Keep `/api/system/status` lightweight: it may report the selected folder identity without opening cloud-hosted `.mauth/project.json` metadata. On macOS, reject `dataless` File Provider placeholders before opening them so project routes return `503 STORAGE_UNAVAILABLE` instead of hanging while the provider downloads a file. Background active-file sync must absorb storage/network failures, preserve the editor draft and selected folder, distinguish unavailable, missing, and revision-conflict states, and report recovery only after the active file is confirmed current or reloaded. Do not reset, migrate, import, overwrite, or silently switch folders to make an outage appear healthy.

For assessment authoring, direct edits to visible document files or `.mauth` metadata are a recovery fallback, not the normal workflow. Prefer, in order: the local agent bridge when available, structured Mauth actions, the project-file API, or the visible Files drawer. Keep active editor state, project-file metadata, loaded revisions, version snapshots, and autosave aligned.

## Mauthdown

Mauthdown is the AI-friendly file format for tests, exams, and worksheets. Prefer explicit containers:

- `:::question`
- top-level section headings in `sectionHeadings`/`documentFlow`
- `:::part`
- `:::subpart`
- `:::text`
- `:::choices`
- `:::table`
- `:::diagram`
- `:::columns`
- `:::space`
- `:::page-break`

Question, part, and subpart labels are automatic. Do not store visible labels like `(a)` or `(i)` in text unless they are part of the actual question content.

Use `$...$` for inline maths and `$$...$$` for display maths. Write simple prose values as normal text, not LaTeX: use `7%`, `15`, `18 months`, `5.7% p.a.`, and `2024 to 2025` unless the value is part of a real formula, equation, coordinate, variable statement, symbolic table heading, or a mathematical answer option in a choices block. Maths is rendered through MathJax SVG. Inline maths is wrapped with `\displaystyle` by default so it stays in the sentence while fractions and operators use display-style sizing. This is a local wrapper, not MathJax display mode, because MathJax display mode creates block layout. If a specific inline formula needs compact sizing, start it with `\textstyle`. TeX still shrinks content inside fraction numerators and denominators; for printable questions, solutions, table cells, and diagram labels, write nested large expressions explicitly, such as `\frac{\displaystyle\binom{n}{r}p^r(1-p)^{n-r}}{\displaystyle\sum_{x=0}^{n} ...}`. Markdown `**bold**`, `*italic*`, and `***bold italic***` are supported in text blocks. Table cells use the same inline maths and formatting renderer.

In solution copies, use the generous student answer space for readable vertical working: usually one mathematical step or conclusion per line. Put each hidden `[[marks:1]]` tick on the exact worked line, answer line, completed table, or completed diagram that earns that mark. For ordinary multi-step calculations, prefer several one-mark ticks over one dense final line with `[[marks:2]]` or `[[marks:3]]`.

For multiple-choice answer keys, keep one shared choices block and set its `solutionAnswerIndex` rather than copying the whole list or writing the answer as prose underneath. The index is zero-based in JSON and `module.settings.update`; Student mode never reveals it, while Solutions mode keeps unselected choices in normal styling and circles only the selected label in solution blue. Put any marks for that response on the same shared choices block with `markTicks`. Legacy solutions-only choice copies remain readable, but new authoring should use the shared in-place answer layer.

For completion-table answers, keep one shared table block and store answers in its sparse body-row `solutionEntries` matrix rather than copying the whole table. Entries are allowed only where the matching student `rows` cell is blank; headers, row labels, and given values stay shared. Student mode ignores the entries, while Solutions mode substitutes them in place, colours only those answer cells blue, and exposes the table `markTicks`. Use `module.settings.update` with `settings: { kind: "table", solutionEntry: { row, column, value } }` for focused agent edits; row and column are zero-based body-cell coordinates and `null` clears an entry. Legacy adjacent student/solution table pairs remain readable, but new authoring should use the shared in-place table layer.

Document templates are explicit. Use `frontMatter.titlePageTemplate = "standard"` for school tests, `"exam"` for exam booklets, `"worksheet"` for compact worksheets where the heading and questions share the first page, `"notes"` for printable mathematics notes, and `"investigation"` for a non-question investigation brief with a linked teacher rubric. In a standard test with multiple named sections, insert a top-level section marker before every section, including the first. The leading marker supplies the section title and section-only mark total on the opening test title page; each later marker generates another full test title page. Section markers are structural and are not repeated as inline headings above the questions. Each title page shows only the marks from its following questions up to the next marker or the end of the document. Present these markers as **T** title-page items in the standard-test mini TOC and human editor, while retaining structured section headings in the saved schema and agent action layer. Every T opens the same full title-page editor. Logo, school name, subject title, main assessment title, and starting question number remain shared document identity; subtitle, name and mark labels, declaration, and instructions may be overridden in that heading's `titlePage` settings. Marks remain calculated from the following questions and are never stored as a manual override. Worksheet headings use the selected mini logo, school name, assessment title, subject title, the bottom heading rule as the name area, and a mark field only when marks exist; do not use `frontMatter.assessmentSubtitle` for worksheets. Math Notes uses a compact heading and renders top-level question containers as note headings; keep marks hidden and use normal text, diagram, table, columns, and space modules under those headings. For worksheet and notes column layouts, use normal `:::columns` modules inside the relevant question, part, or subpart rather than document-level worksheet columns.

Investigation documents use `formattingConfig.id = "investigation"` and intentionally contain no questions, parts, solution slots, or section-creation controls. Keep the shared task, general criterion headings, student guidance, and detailed teacher allocation rows under `frontMatter.investigation`. Student mode uses one standard-test title page ordered as title identity, Name/Result row, then task and general marking guidance. Do not place the task between the title and student row, render a second brief header, repeat the logo, or add a separate administration grid. Teacher mode retains that student page and adds as many compact rubric pages as the detailed criteria need; repeat the rubric context, title, and column headings, but show the final total only on the last rubric page. Treat those shared criteria as the source of truth: edit a heading or guidance once and do not duplicate the rubric as ordinary prose, fake questions, or a separate solutions document. Use `scoringMode: "additive"` when a criterion earns several independent allocations and derive its marks by summing those rows. Use `scoringMode: "holistic"` for alternative performance levels such as 4, 3, 2, and 1, and derive the criterion marks from the highest available level rather than adding the alternatives.

Use top-level section headings for worksheet sections such as `Multiple choice` and `Short answer`. Do not fake these as zero-mark questions or first text modules inside a question. In JSON/action snapshots they live in `sectionHeadings` and `documentFlow`; use `sectionHeading.add`, `sectionHeading.update`, `sectionHeading.delete`, and `sectionHeading.reorder` actions when available.

For worksheet multiple-choice questions, prefer compact `:::choices layout="inline"` when the options are short enough to fit on one line; `layout="two-column"` also renders as a compact wrapped row in worksheet preview when it fits. Keep all mathematical options in the same visual mode: if some choices use algebraic LaTeX, wrap simple numeric choices such as `$18$`, `$-3$`, and `$24$` in inline maths too.

## AI Rule Brains

Keep AI authoring behaviour split into focused rule sets. The machine-readable configs live in `configs/ai-brains/`, with overview docs in `docs/ai-brains.md`.

- Question brain: curriculum fit, wording, marks intent, and mathematical correctness.
- Formatting brain: page flow, spacing, typography, page breaks, and print layout.
- Diagram brain: JSXGraph, Penrose, and Plotly diagram specs, labels, scaling, and visual clarity.
- Solutions brain: worked solutions, answer keys, rubric-aligned reasoning, and solution-copy formatting.

All brains operate on the same Mauthdown/test schema. Do not let formatting, diagram, or solutions rules leak into question-writing logic.

AI-authored document edits should prefer the structured Mauth action layer in `apps/web/src/lib/mauthActions.ts` when the action exists. Human UI controls should use the same action path where practical, so external agents can rely on deterministic edit contracts instead of guessing local React state. Use document action batches when edits touch front matter, logo/school-name selection, page format, and question content together; use question action batches for question-only edits. Use `module.move`, `part.move`, and `subpart.move` for relocating existing content so ids, undo/history, mixed `itemOrder`, and validation remain intact. For large model-generated edits, run a document-action dry run first and inspect the preview summary before committing the same batch.

The target authoring loop is: read the current Mauth snapshot, dry-run a structured action batch, inspect preview/validation output, apply the same batch with revision/idempotency protection, then verify in the browser. Keep `pnpm test:web-actions` passing when changing the action contract.

Formatting brain rule: treat `:::space` blocks as intentional working area, not generic page filler. If a manual page break immediately follows a question, do not add a trailing question-level space block just to fill the remaining page area. Keep spaces inside parts/subparts when they are intended answer space for that part.

When an agent formats a test or exam, inspect and adjust spare working space page by page. Share the usable spare line capacity among the existing answer spaces on that page in proportion to the marks represented by those spaces; if marks are unavailable, use equal judgement. Use conservative whole-line counts, conceptually flooring proportional shares so the edits cannot exceed the observed capacity. Leave any uncertain remainder at the page bottom, preserve teacher overrides, and verify Student and Solutions after applying the explicit `Space` edits. This is an agent authoring philosophy, not an automatic renderer or pagination feature.

For deliberate splits inside a long question, use `pageBreakBefore` on the relevant part or subpart. Keep question-boundary page breaks in the mini TOC/page-break-after-question model; do not reintroduce standalone page-break modules inside question content.

When adding a durable behaviour rule, update both the relevant brain config and the human docs. Do not add one-off preferences to a brain unless they should apply to future AI/API authoring. Prefer small, testable rules that point to the shared schema.

## Diagram Systems

Use the shared diagram shape:

```json
{ "type": "...", "data": {}, "style": "...", "options": {} }
```

Current diagram systems:

- `graph2d` and `graph3d`: JSXGraph.
- `geometricConstruction`, `network`, and `setDiagram`: Penrose-backed static diagrams.
- `statsChart`: Plotly-backed statistical charts.
- `image`: uploaded/imported bitmaps with structured overlay annotations.

Keep these rendering systems separate. Do not unify Penrose, Plotly, and JSXGraph internals.

For copied `graph2d` and `vector2d` coordinate graphs, default to major grid lines only. Use `showMinorGrid: true` only when the source visibly uses minor grid lines, small squares, or fractional grid spacing; do not add minor grid lines just to make a graph look more detailed. Axis number labels should align to the major grid interval. The x-axis number step follows `gridMajorStepX`/`gridMajorStep`, and the y-axis number step follows `gridMajorStepY`/`gridMajorStep`, even when the grid is hidden. Only set `axisLabelIntervalMode: "manual"` with a different `axisLabelStepX`/`axisLabelStepY` when the source intentionally labels a different interval or a teacher asks for custom labels.

For `graph2d` axis arrowheads, leave the arrow off an axis endpoint that terminates at the origin. The renderer uses this as the automatic default. Use `showXAxisMinArrow`, `showXAxisMaxArrow`, `showYAxisMinArrow`, and `showYAxisMaxArrow` for deliberate per-end overrides; use `showArrows: false` only when all axis arrowheads should be hidden. Keep the built-in `x` and `y` labels draggable in the editor even when a shared graph contains hidden solution elements; persist those moves through the axis-label coordinate fields without replacing the hidden solution layer.

For `graph2d` functions with natural boundaries, singularities, endpoints, or asymptotes, choose the function domain and view window together. Treat graph bounds (`xMin`, `xMax`, `yMin`, `yMax`) as the visible extent: axes, auto-domain functions, manual-domain functions, and grid-spanning asymptotes render to the grid, not beyond it. Infer valid domains for `log`, `ln`, `log10`, `sqrt`, reciprocal/rational forms, and trigonometric asymptotes before setting `domainMin`/`domainMax`; manual function domains are for restrictions inside the grid and should not be used to extend the visible graph. Draw asymptotes as separate dashed `line_segment` features with `span: "grid"` and keep the function strictly inside undefined boundaries so the curve and arrowheads do not clip into the asymptote. For multi-branch functions, use separate function entries or pieces for each valid interval rather than one plotted interval crossing a singularity. If the rendered `x` or `y` axis-letter label needs manual adjustment, set `xAxisLabelX`/`xAxisLabelY` or `yAxisLabelX`/`yAxisLabelY`; do not fake axis-letter placement with extra free-label features.

For `graph2d` angle markers bounded by existing sides or rays, set `firstSegmentId` and `secondSegmentId` to two connected `line_segment` feature ids. The segments must share the angle vertex; the marker derives both arms from those segments and follows later endpoint edits. Coordinate-only `x`/`y` plus `x1`/`y1`/`x2`/`y2` markers remain a legacy fallback for standalone annotations with no suitable segment features.

For Penrose diagrams, normal authoring should use the structured geometry, network, and set data when the standard controls are sufficient. Advanced Substance remains the escape hatch for custom constraints; the app supplies family presets such as `geometry` and `sets`. Use `EqualLength(AB, CD)` with named segments for readable geometry side constraints; `EqualLength(A, B, C, D)` is supported for compact point-pair constraints. New `setDiagram` blocks should default to the `sets` preset rather than embedding generated Domain or Style.

For statistics charts, extend `packages/diagram-plotly` instead of adding chart logic to JSXGraph or React components.

Shared `statsChart` surfaces support editable supplemental series in `data.series`. Series may use `line`, `points`, `linePoints`, or `bars`; each series carries its own coordinates, styling, visibility, and `solutionOnly` state. New series added in Solutions mode default to `solutionOnly`, are hidden from Student editor/preview, and render in solution blue without recolouring the shared chart. Use an element-level `diagram.settings.update` target for small answer overlays and a paired solution diagram when the whole chart should differ independently.

Uploaded `image` surfaces support structured labels, ellipses, and arrows in `data.annotations`. Annotation geometry uses percentage coordinates so it remains aligned when the image is resized. New annotations added in Solutions mode default to `solutionOnly`, are hidden from Student editor/preview, and render in solution blue without recolouring the bitmap or shared annotations. Use an element-level `diagram.settings.update` target for focused image answers and a paired solution image only when the whole bitmap should be replaced or completed independently.

For solution-copy graph annotations, use editable graph features such as `point`, `label`, and `line_segment`. Do not draw one-off SVG overlays in React.

When the editor is in Solutions mode, newly added `graph2d` features default to `solutionOnly: true`. This is the manual annotation path for adding points, labels, segments, tangents, markers, and shading to a shared student graph without exposing the answer in the student copy. Keep the inspector override available when a feature is deliberately shared.

New `graph2d` functions follow the same active authoring layer. A function added in Solutions mode defaults to `solutionOnly: true`, is hidden from the Student editor/preview, and renders in solution blue without recolouring shared curves. Student mode also hides any graph feature that references a hidden solution function while preserving function indexes for the remaining graph. Use a focused `diagram.settings.update` function target for agent edits and a paired solution diagram only when the entire graph should differ independently.

A shared diagram with supported structured `solutionOnly` elements is itself a valid student response and solution surface. Its diagram `markTicks` may carry the marks earned directly on those answer elements; preview and print must keep the shared diagram in normal styling, colour only the answer elements blue, and place the ticks beside the surface. A paired solution diagram is not complete merely because the copy exists: its mathematical answer content must differ from the student diagram. Ignore presentation-only changes such as size, colour, grid, view bounds, chart range, or 3D camera when making that completeness decision.

New `geometry2d` points, segments, arcs, angles, and construction markers follow the same Solutions-mode rule. Store `solutionOnly` on the primitive, filter it from Student editor/preview, render only that primitive in solution blue, and keep the primitive inspector override. Use this element-level path for small additions to a shared construction and a paired solution diagram for a wholly completed or independently changed diagram.

New `vector2d` vectors, segment labels, and angle markers also follow the active authoring layer. In Solutions mode, store `solutionOnly` on the element, hide it from Student editor/preview, render only that element in solution blue, and preserve the element-level override. Keep referenced elements coherent: a student-visible segment label or angle marker must not depend on a solution-only vector that is hidden from the student diagram. Use a paired solution diagram when the entire vector construction should differ independently.

New `graph3d` points, segments, and dimensions follow the same active authoring layer and are directly editable in the 3D diagram panel. Existing faces and solids also support `solutionOnly` and an element-level override. Student preview keeps hidden solution points in the range calculation with `show: false` so the camera and shared geometry do not jump, while suppressing any segment, dimension, face, or solid that depends on a hidden point. Solutions preview colours only solution elements blue. Use a paired solution diagram when the whole 3D construction should differ independently.

Structured Penrose geometry and network diagrams support solution-only points/nodes and segments/links. New elements added in Solutions mode default to `solutionOnly`, Student mode removes them and relationships that depend on hidden points, and Solutions preview colours only those answer elements and labels blue. Structured two-set and three-set Venn diagrams support solution-only region labels/values and shading while preserving the fixed region slots in Student mode. Use element-level `diagram.settings.update` targets for these focused answers. Do not mix structured element editing with a custom `options.substanceSource`: return to structured data or use a paired solution diagram. Complex construction predicates such as angle/equality constraints and wholly changed diagrams remain paired-solution-copy work rather than pretending every Substance predicate has an editable solution layer.

## Print

PDF output uses the browser print dialog and Save as PDF from the same generated A4 preview pages shown on screen. Screen preview uses pixel-sized page boxes for visual layout and zoom. Print CSS should use physical paged-media rules: `@page { size: A4; }` owns paper size and margins, while each generated app page renders only its printable content area. Do not make print DOM pages full physical-height paper boxes; that can create blank trailing pages in WebKit/Safari. Avoid browser-specific print branches unless a narrow compatibility issue is proven.

Treat measured preview pagination as structured formatting evidence. The live Student and Solutions previews report page totals, supplementary-page totals, and any block taller than the printable A4 content area. Surface those reports through System Status and the current agent snapshot as `rendered-page-overflow` warnings; do not fold them into solution-completeness validation or attach stale current-document warnings to an unrendered action-preview result.

## Frontend Notes

`apps/web/src/App.tsx` is currently a large editor file. Keep edits scoped and prefer extracting new reusable logic rather than growing it further when a change touches a separable area.

Drag/drop rules are hierarchical:

- Questions reorder with questions.
- Question-level content and parts reorder within a question.
- Part-level content and subparts reorder within a part.
- Subpart-level content reorders within a subpart.

Use visible drop zones and preserve automatic relabelling after moves.

## Backend Formatting

Marks display uses parentheses, for example `(1 mark)` and `(3 marks)`. Keep backend HTML, web preview, and future export paths aligned.
