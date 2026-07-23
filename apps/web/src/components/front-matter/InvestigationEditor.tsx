import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { InlineSummaryTitle } from "@/components/MathText";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { NumericExpressionInput } from "@/components/editor/NumericExpressionInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  investigationCriterionMarks,
  investigationTotalMarks,
  normalizeInvestigation,
  type FrontMatterConfig,
  type InvestigationConfig,
  type InvestigationCriterionConfig,
} from "@/lib/frontMatterConfig";

interface InvestigationEditorProps {
  frontMatter: FrontMatterConfig;
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

export function InvestigationEditor({ frontMatter, onChange }: InvestigationEditorProps) {
  const investigation = normalizeInvestigation(frontMatter.investigation);
  const updateInvestigation = (patch: Partial<InvestigationConfig>) => onChange({ investigation: { ...investigation, ...patch } });
  const updateCriterion = (criterionId: string, patch: Partial<InvestigationCriterionConfig>) =>
    updateInvestigation({
      criteria: investigation.criteria.map((criterion) => (criterion.id === criterionId ? { ...criterion, ...patch } : criterion)),
    });

  return (
    <>
      <CollapsiblePanel
        title={<InlineSummaryTitle label="Investigation brief" summary={investigation.taskTitle} />}
        defaultOpen
        className="bg-muted/20"
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Task heading
            <input
              value={investigation.taskTitle}
              onChange={(event) => updateInvestigation({ taskTitle: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Task text
            <Textarea
              value={investigation.taskBody}
              onChange={(event) => updateInvestigation({ taskBody: event.target.value })}
              className="min-h-32 text-sm"
            />
          </label>
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

      <CollapsiblePanel
        title={
          <InlineSummaryTitle
            label="Marking guidance and teacher rubric"
            summary={`${investigation.criteria.length} criteria, ${investigationTotalMarks(investigation)} marks`}
          />
        }
        defaultOpen
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
            <section key={criterion.id} className="rounded-md border bg-background p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <strong className="min-w-0 flex-1 text-sm">
                  Criterion {criterionIndex + 1}: {investigationCriterionMarks(criterion)} marks
                </strong>
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
              </div>

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
            </section>
          ))}
        </div>
      </CollapsiblePanel>
    </>
  );
}
