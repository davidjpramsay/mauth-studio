import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { DiagramAlignment } from "@mauth-studio/shared";

import { InlineSummaryTitle } from "@/components/MathText";
import { DiagramBlockEditor } from "@/components/editor/DiagramBlockEditor";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { NumericExpressionInput } from "@/components/editor/NumericExpressionInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  investigationCriterionMarks,
  investigationTotalMarks,
  normalizeInvestigation,
  withInvestigationLegacyMirrors,
  type FrontMatterConfig,
  type InvestigationConfig,
  type InvestigationCriterionConfig,
  type InvestigationDiagramConfig,
  type InvestigationStudentPageConfig,
  type InvestigationTextSectionConfig,
} from "@/lib/frontMatterConfig";
import { DEFAULT_2D_GRAPH } from "@/lib/diagramGraph2d";
import {
  SCROLL_ANCHOR_INVESTIGATION_RUBRIC,
  investigationDiagramScrollAnchor,
  investigationPageScrollAnchor,
  investigationTextSectionScrollAnchor,
  scrollAnchorContains,
} from "@/lib/scrollAnchors";

interface InvestigationEditorProps {
  frontMatter: FrontMatterConfig;
  activeAnchor?: string;
  openSignalForAnchor?: (anchor: string) => number | undefined;
  onActivateAnchor?: (anchor: string) => void;
  onChange: (patch: Partial<FrontMatterConfig>) => void;
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function InvestigationEditor({
  frontMatter,
  activeAnchor,
  openSignalForAnchor,
  onActivateAnchor,
  onChange,
}: InvestigationEditorProps) {
  const investigation = normalizeInvestigation(frontMatter.investigation);
  const updateInvestigation = (patch: Partial<InvestigationConfig>) =>
    onChange({ investigation: withInvestigationLegacyMirrors({ ...investigation, ...patch }) });
  const updateCriterion = (criterionId: string, patch: Partial<InvestigationCriterionConfig>) =>
    updateInvestigation({
      criteria: investigation.criteria.map((criterion) => (criterion.id === criterionId ? { ...criterion, ...patch } : criterion)),
    });
  const updateDiagram = (diagramId: string, patch: Partial<InvestigationDiagramConfig>) =>
    updateInvestigation({
      diagrams: investigation.diagrams.map((diagram) => (diagram.id === diagramId ? { ...diagram, ...patch } : diagram)),
    });
  const updatePage = (pageId: string, patch: Partial<InvestigationStudentPageConfig>) =>
    updateInvestigation({
      studentPages: investigation.studentPages.map((page) => (page.id === pageId ? { ...page, ...patch } : page)),
    });
  const updateTextSection = (pageId: string, sectionId: string, patch: Partial<InvestigationTextSectionConfig>) => {
    const page = investigation.studentPages.find((entry) => entry.id === pageId);
    if (!page) return;
    updatePage(pageId, {
      sections: page.sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
    });
  };
  const addTextSection = (pageId: string) => {
    const page = investigation.studentPages.find((entry) => entry.id === pageId);
    if (!page) return;
    updatePage(pageId, {
      sections: [...page.sections, { id: id("investigation-text"), heading: "New text section", body: "" }],
    });
  };
  const addPage = () => {
    const pageNumber = investigation.studentPages.length + 1;
    updateInvestigation({
      studentPages: [
        ...investigation.studentPages,
        {
          id: id("investigation-page"),
          title:
            pageNumber === 2
              ? `${investigation.studentPages[0]?.title || investigation.taskTitle} (continued)`
              : `Student page ${pageNumber}`,
          sections: [{ id: id("investigation-text"), heading: "New text section", body: "" }],
        },
      ],
    });
  };
  const removePage = (pageId: string) => {
    if (investigation.studentPages.length <= 1) return;
    const remainingPages = investigation.studentPages.filter((page) => page.id !== pageId);
    const fallbackPageId = remainingPages[0].id;
    updateInvestigation({
      studentPages: remainingPages,
      diagrams: investigation.diagrams.map((diagram) =>
        diagram.pageId === pageId ? { ...diagram, pageId: fallbackPageId, page: 1 } : diagram,
      ),
    });
  };
  const addDiagram = (pageId: string) =>
    updateInvestigation({
      diagrams: [
        ...investigation.diagrams,
        {
          id: id("investigation-diagram"),
          title: "New diagram",
          caption: "Explain what the diagram shows and how it relates to the task.",
          pageId,
          page: investigation.studentPages[1]?.id === pageId ? 2 : 1,
          alignment: "center",
          graphConfig: { ...DEFAULT_2D_GRAPH, functions: [...(DEFAULT_2D_GRAPH.functions ?? [])], features: [] },
        },
      ],
    });

  return (
    <>
      <CollapsiblePanel
        title={<InlineSummaryTitle label="Investigation brief" summary={`${investigation.studentPages.length} student pages`} />}
        defaultOpen
        className="bg-muted/20"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={addPage}>
            <Plus data-icon="inline-start" />
            Add page
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {investigation.studentPages.map((page, pageIndex) => {
            const pageDiagrams = investigation.diagrams.filter((diagram) => diagram.pageId === page.id);
            const pageAnchor = investigationPageScrollAnchor(page.id);
            return (
              <div key={page.id} data-scroll-anchor={pageAnchor}>
                <CollapsiblePanel
                  title={`Student page ${pageIndex + 1}`}
                  subtitle={page.title || "Untitled page"}
                  defaultOpen={pageIndex === 0}
                  openSignal={openSignalForAnchor?.(pageAnchor)}
                  active={scrollAnchorContains(pageAnchor, activeAnchor)}
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Move page up"
                        aria-label={`Move student page ${pageIndex + 1} up`}
                        disabled={pageIndex === 0}
                        onClick={() => updateInvestigation({ studentPages: moveItem(investigation.studentPages, pageIndex, -1) })}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Move page down"
                        aria-label={`Move student page ${pageIndex + 1} down`}
                        disabled={pageIndex === investigation.studentPages.length - 1}
                        onClick={() => updateInvestigation({ studentPages: moveItem(investigation.studentPages, pageIndex, 1) })}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Remove page"
                        aria-label={`Remove student page ${pageIndex + 1}`}
                        disabled={investigation.studentPages.length <= 1}
                        onClick={() => removePage(page.id)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  }
                >
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Page heading
                    <input
                      value={page.title}
                      onChange={(event) => updatePage(page.id, { title: event.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Text sections</h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => addTextSection(page.id)}>
                      <Plus data-icon="inline-start" />
                      Add text section
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-col gap-3">
                    {page.sections.map((section, sectionIndex) => (
                      <div key={section.id} data-scroll-anchor={investigationTextSectionScrollAnchor(page.id, section.id)}>
                        <CollapsiblePanel
                          title={`Text section ${sectionIndex + 1}`}
                          subtitle={section.heading || "Continuous text"}
                          defaultOpen={sectionIndex === 0}
                          openSignal={openSignalForAnchor?.(investigationTextSectionScrollAnchor(page.id, section.id))}
                          active={scrollAnchorContains(investigationTextSectionScrollAnchor(page.id, section.id), activeAnchor)}
                          className="bg-muted/20"
                          actions={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Remove text section"
                              aria-label={`Remove text section ${sectionIndex + 1}`}
                              onClick={() => updatePage(page.id, { sections: page.sections.filter((entry) => entry.id !== section.id) })}
                            >
                              <Trash2 />
                            </Button>
                          }
                        >
                          <div className="grid grid-cols-1 gap-3">
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Optional section heading
                              <input
                                value={section.heading}
                                onChange={(event) => updateTextSection(page.id, section.id, { heading: event.target.value })}
                                placeholder="Leave blank for continuous report text"
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              />
                            </label>
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Section text
                              <Textarea
                                value={section.body}
                                onChange={(event) => updateTextSection(page.id, section.id, { body: event.target.value })}
                                className="min-h-32 text-sm"
                              />
                            </label>
                          </div>
                        </CollapsiblePanel>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Diagrams</h4>
                    <Button type="button" variant="outline" size="sm" onClick={() => addDiagram(page.id)}>
                      <Plus data-icon="inline-start" />
                      Add diagram
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-col gap-3">
                    {pageDiagrams.map((diagram) => {
                      const diagramIndex = investigation.diagrams.findIndex((entry) => entry.id === diagram.id);
                      const diagramAnchor = investigationDiagramScrollAnchor(page.id, diagram.id);
                      return (
                        <section
                          key={diagram.id}
                          data-scroll-anchor={diagramAnchor}
                          className="rounded-md border bg-muted/20 p-3"
                          onPointerDownCapture={() => onActivateAnchor?.(diagramAnchor)}
                          onFocusCapture={() => onActivateAnchor?.(diagramAnchor)}
                        >
                          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Diagram title
                              <input
                                value={diagram.title}
                                onChange={(event) => updateDiagram(diagram.id, { title: event.target.value })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              />
                            </label>
                            <label className="flex flex-col gap-2 text-xs font-medium">
                              Student page
                              <select
                                value={diagram.pageId}
                                onChange={(event) => updateDiagram(diagram.id, { pageId: event.target.value })}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                              >
                                {investigation.studentPages.map((entry, entryIndex) => (
                                  <option key={entry.id} value={entry.id}>
                                    Page {entryIndex + 1}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                              Caption
                              <Textarea
                                value={diagram.caption}
                                onChange={(event) => updateDiagram(diagram.id, { caption: event.target.value })}
                                className="min-h-20 text-sm"
                              />
                            </label>
                          </div>
                          <DiagramBlockEditor
                            label={`Investigation diagram ${diagramIndex + 1}`}
                            graphConfig={diagram.graphConfig}
                            alignment={diagram.alignment}
                            showSolutions={false}
                            settingsMode="inspector"
                            anchor={diagramAnchor}
                            activeAnchor={activeAnchor}
                            active={scrollAnchorContains(diagramAnchor, activeAnchor)}
                            openSignal={openSignalForAnchor?.(diagramAnchor)}
                            onActivateAnchor={onActivateAnchor}
                            onChange={(graphConfig) => updateDiagram(diagram.id, { graphConfig })}
                            onAlignmentChange={(alignment: DiagramAlignment) => updateDiagram(diagram.id, { alignment })}
                            onRemove={() =>
                              updateInvestigation({ diagrams: investigation.diagrams.filter((entry) => entry.id !== diagram.id) })
                            }
                          />
                        </section>
                      );
                    })}
                  </div>
                </CollapsiblePanel>
              </div>
            );
          })}
          <label className="flex flex-col gap-2 text-xs font-medium">
            Student guidance heading
            <input
              value={investigation.guidanceTitle}
              onChange={(event) => updateInvestigation({ guidanceTitle: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
      </CollapsiblePanel>

      <div data-scroll-anchor={SCROLL_ANCHOR_INVESTIGATION_RUBRIC}>
        <CollapsiblePanel
          title={
            <InlineSummaryTitle
              label="Marking guidance and teacher rubric"
              summary={`${investigation.criteria.length} criteria, ${investigationTotalMarks(investigation)} marks`}
            />
          }
          defaultOpen={scrollAnchorContains(SCROLL_ANCHOR_INVESTIGATION_RUBRIC, activeAnchor)}
          openSignal={openSignalForAnchor?.(SCROLL_ANCHOR_INVESTIGATION_RUBRIC)}
          className="bg-muted/20"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateInvestigation({
                  criteria: [
                    ...investigation.criteria,
                    {
                      id: id("investigation-criterion"),
                      heading: "New criterion",
                      guidance: "Describe what students should demonstrate.",
                      scoringMode: "additive",
                      allocations: [
                        {
                          id: id("investigation-allocation"),
                          marks: 1,
                          description: "Describe the evidence required for this mark.",
                        },
                      ],
                    },
                  ],
                })
              }
            >
              <Plus data-icon="inline-start" />
              Add criterion
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Teacher rubric title
                <input
                  value={investigation.rubricTitle}
                  onChange={(event) => updateInvestigation({ rubricTitle: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                Teacher rubric instructions
                <Textarea
                  value={investigation.rubricInstructions}
                  onChange={(event) => updateInvestigation({ rubricInstructions: event.target.value })}
                  className="min-h-20 text-sm"
                />
              </label>
            </div>

            {investigation.criteria.map((criterion, criterionIndex) => (
              <CollapsiblePanel
                key={criterion.id}
                title={`Criterion ${criterionIndex + 1}`}
                subtitle={`${criterion.heading || "Untitled criterion"} · ${investigationCriterionMarks(criterion)} marks`}
                defaultOpen={criterionIndex === 0}
                className="bg-background"
                actions={
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Move criterion up"
                      aria-label={`Move criterion ${criterionIndex + 1} up`}
                      disabled={criterionIndex === 0}
                      onClick={() => updateInvestigation({ criteria: moveItem(investigation.criteria, criterionIndex, -1) })}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Move criterion down"
                      aria-label={`Move criterion ${criterionIndex + 1} down`}
                      disabled={criterionIndex === investigation.criteria.length - 1}
                      onClick={() => updateInvestigation({ criteria: moveItem(investigation.criteria, criterionIndex, 1) })}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remove criterion"
                      aria-label={`Remove criterion ${criterionIndex + 1}`}
                      disabled={investigation.criteria.length <= 1}
                      onClick={() => updateInvestigation({ criteria: investigation.criteria.filter((entry) => entry.id !== criterion.id) })}
                    >
                      <Trash2 />
                    </Button>
                  </>
                }
              >
                <div className="grid grid-cols-1 gap-3">
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Shared criterion heading
                    <input
                      value={criterion.heading}
                      onChange={(event) => updateCriterion(criterion.id, { heading: event.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Student guidance
                    <Textarea
                      value={criterion.guidance}
                      onChange={(event) => updateCriterion(criterion.id, { guidance: event.target.value })}
                      className="min-h-20 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium sm:max-w-64">
                    Scoring method
                    <select
                      value={criterion.scoringMode}
                      onChange={(event) =>
                        updateCriterion(criterion.id, {
                          scoringMode: event.target.value === "holistic" ? "holistic" : "additive",
                        })
                      }
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    >
                      <option value="additive">Add mark allocations</option>
                      <option value="holistic">Choose one performance level</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    {criterion.scoringMode === "holistic" ? "Teacher performance levels" : "Teacher mark allocation"}
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateCriterion(criterion.id, {
                        allocations: [
                          ...criterion.allocations,
                          {
                            id: id("investigation-allocation"),
                            marks: 1,
                            description: "Describe the evidence required for this mark.",
                          },
                        ],
                      })
                    }
                  >
                    <Plus data-icon="inline-start" />
                    {criterion.scoringMode === "holistic" ? "Add level" : "Add allocation"}
                  </Button>
                </div>

                <div className="mt-2 flex flex-col gap-2">
                  {criterion.allocations.map((allocation, allocationIndex) => (
                    <div key={allocation.id} className="grid grid-cols-[6rem_minmax(0,1fr)_2.25rem] items-start gap-2">
                      <label className="flex flex-col gap-1 text-xs font-medium">
                        {criterion.scoringMode === "holistic" ? "Level" : "Marks"}
                        <NumericExpressionInput
                          value={allocation.marks}
                          min={0}
                          max={100}
                          step={1}
                          ariaLabel={`${criterion.heading} allocation ${allocationIndex + 1} marks`}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                          onValueChange={(value) =>
                            updateCriterion(criterion.id, {
                              allocations: criterion.allocations.map((entry) =>
                                entry.id === allocation.id ? { ...entry, marks: Math.max(0, Math.floor(value ?? 0)) } : entry,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium">
                        Evidence required
                        <Textarea
                          value={allocation.description}
                          onChange={(event) =>
                            updateCriterion(criterion.id, {
                              allocations: criterion.allocations.map((entry) =>
                                entry.id === allocation.id ? { ...entry, description: event.target.value } : entry,
                              ),
                            })
                          }
                          className="min-h-16 text-sm"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Remove mark allocation"
                        aria-label={`Remove ${criterion.heading} allocation ${allocationIndex + 1}`}
                        disabled={criterion.allocations.length <= 1}
                        onClick={() =>
                          updateCriterion(criterion.id, {
                            allocations: criterion.allocations.filter((entry) => entry.id !== allocation.id),
                          })
                        }
                        className="mt-5"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsiblePanel>
            ))}
          </div>
        </CollapsiblePanel>
      </div>
    </>
  );
}
