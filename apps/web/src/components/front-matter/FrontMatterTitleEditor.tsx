import { useEffect, useState } from "react";
import { ImagePlus, Save, Trash2 } from "lucide-react";

import { InlineSummaryTitle } from "@/components/MathText";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EXAM_SECTION_PRESETS,
  assessmentTitleText,
  examSectionPresetById,
  examSectionPresetFromValue,
  examSectionPresetPatch,
  normalizeExamTitlePage,
  titlePageTemplateLabel,
  type FrontMatterConfig,
} from "@/lib/frontMatterConfig";
import { selectedLogoFromLibrary, type LogoAsset } from "@/lib/logoLibrary";

interface FrontMatterTitleEditorProps {
  frontMatter: FrontMatterConfig;
  logos: LogoAsset[];
  openSignal?: number;
  onChange: (patch: Partial<FrontMatterConfig>) => void;
  onAddLogo: (file: File) => void;
  onUpdateLogo: (logoId: string, patch: { name: string; schoolName: string }) => void;
  onRemoveLogo: (logoId: string) => void;
}

export function FrontMatterTitleEditor({
  frontMatter,
  logos,
  openSignal,
  onChange,
  onAddLogo,
  onUpdateLogo,
  onRemoveLogo,
}: FrontMatterTitleEditorProps) {
  const selectedLogo = selectedLogoFromLibrary(logos, frontMatter.logoId);
  const [logoNameDraft, setLogoNameDraft] = useState(selectedLogo.name);
  const normalizedLogoNameDraft = logoNameDraft.trim() || selectedLogo.name;
  const selectedLogoSchoolName = selectedLogo.schoolName ?? "";
  const logoHasDraftChanges = normalizedLogoNameDraft !== selectedLogo.name || frontMatter.schoolName !== selectedLogoSchoolName;
  const titlePageTemplate = frontMatter.titlePageTemplate ?? "standard";
  const isCompactDocumentTemplate = titlePageTemplate === "worksheet" || titlePageTemplate === "notes";
  const exam = normalizeExamTitlePage(frontMatter.exam);
  const activeExamSectionPreset = examSectionPresetById(exam.sectionPreset);

  useEffect(() => {
    setLogoNameDraft(selectedLogo.name);
  }, [selectedLogo.id, selectedLogo.name]);

  function handleUpdateLogo() {
    onUpdateLogo(selectedLogo.id, {
      name: normalizedLogoNameDraft,
      schoolName: frontMatter.schoolName,
    });
    setLogoNameDraft(normalizedLogoNameDraft);
  }

  return (
    <CollapsiblePanel
      title={
        <InlineSummaryTitle
          label="Title"
          summary={`${frontMatter.subjectTitle} - ${
            isCompactDocumentTemplate ? frontMatter.assessmentTitle : assessmentTitleText(frontMatter.assessmentTitle)
          }`}
        />
      }
      defaultOpen={false}
      className="bg-muted/20"
      openSignal={openSignal}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
          Template
          <div
            className="flex min-h-9 items-center rounded-md border border-border bg-muted/30 px-2 text-sm font-normal text-muted-foreground"
            aria-label={`Document template: ${titlePageTemplateLabel(titlePageTemplate)}`}
          >
            {titlePageTemplateLabel(titlePageTemplate)}
          </div>
        </div>
        {titlePageTemplate === "exam" ? (
          <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
            Exam section
            <select
              value={activeExamSectionPreset.id}
              onChange={(event) => onChange(examSectionPresetPatch(exam, examSectionPresetFromValue(event.target.value)))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            >
              {EXAM_SECTION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isCompactDocumentTemplate ? (
          <>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Logo
              <select
                value={frontMatter.logoId}
                onChange={(event) => onChange({ logoId: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                <option value="">No logo</option>
                {logos.map((logoOption) => (
                  <option key={logoOption.id} value={logoOption.id}>
                    {logoOption.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              School name
              <input
                value={frontMatter.schoolName}
                onChange={(event) => onChange({ schoolName: event.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              />
            </label>
          </>
        ) : (
          <div className="rounded-md border bg-background p-3 md:col-span-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[88px_minmax(0,1fr)] md:items-center">
              <div className="flex h-24 items-center justify-center rounded-md border bg-white p-2">
                {selectedLogo ? (
                  <img className="max-h-full max-w-full object-contain" src={selectedLogo.src} alt={`${selectedLogo.name} logo`} />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
                    Logo
                    <select
                      value={frontMatter.logoId}
                      onChange={(event) => onChange({ logoId: event.target.value })}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    >
                      {logos.map((logoOption) => (
                        <option key={logoOption.id} value={logoOption.id}>
                          {logoOption.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    Logo name
                    <input
                      value={logoNameDraft}
                      onChange={(event) => setLogoNameDraft(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-medium">
                    School name
                    <Textarea
                      value={frontMatter.schoolName}
                      onChange={(event) => onChange({ schoolName: event.target.value })}
                      className="min-h-16 font-mono text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                    <ImagePlus className="size-4" aria-hidden="true" />
                    Add logo
                    <input
                      type="file"
                      accept="image/*,.svg"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) onAddLogo(file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <Button type="button" variant="outline" size="sm" disabled={!logoHasDraftChanges} onClick={handleUpdateLogo}>
                    <Save data-icon="inline-start" />
                    Update logo
                  </Button>
                  {selectedLogo && logos.length > 1 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => onRemoveLogo(selectedLogo.id)}>
                      <Trash2 data-icon="inline-start" />
                      Remove logo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
        <label className="flex flex-col gap-2 text-xs font-medium">
          {isCompactDocumentTemplate ? "Course" : "Subject title"}
          <input
            value={frontMatter.subjectTitle}
            onChange={(event) => onChange({ subjectTitle: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          {titlePageTemplate === "notes" ? "Notes title" : titlePageTemplate === "worksheet" ? "Worksheet title" : "Assessment title"}
          <input
            value={isCompactDocumentTemplate ? frontMatter.assessmentTitle : assessmentTitleText(frontMatter.assessmentTitle)}
            onChange={(event) =>
              onChange({
                assessmentTitle: isCompactDocumentTemplate ? event.target.value : assessmentTitleText(event.target.value),
              })
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        {titlePageTemplate !== "exam" ? (
          <>
            {!isCompactDocumentTemplate ? (
              <label className="flex flex-col gap-2 text-xs font-medium">
                Name label
                <input
                  value={frontMatter.nameLabel}
                  onChange={(event) => onChange({ nameLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            ) : null}
            {titlePageTemplate !== "notes" ? (
              <label className="flex flex-col gap-2 text-xs font-medium">
                Mark label
                <input
                  value={frontMatter.markLabel}
                  onChange={(event) => onChange({ markLabel: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
            ) : null}
          </>
        ) : null}
        {titlePageTemplate !== "notes" ? (
          <label className="flex flex-col gap-2 text-xs font-medium">
            Start questions at
            <input
              type="number"
              min={1}
              step={1}
              value={frontMatter.startQuestionNumber}
              onChange={(event) => onChange({ startQuestionNumber: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        ) : null}
        {titlePageTemplate !== "worksheet" ? (
          <div className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
            <label className="flex h-9 items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={frontMatter.showAssessmentSubtitle}
                onChange={(event) => onChange({ showAssessmentSubtitle: event.target.checked })}
              />
              Show assessment subtitle
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Assessment subtitle
              {titlePageTemplate === "exam" ? (
                <Textarea
                  value={frontMatter.assessmentSubtitle}
                  onChange={(event) => onChange({ assessmentSubtitle: event.target.value })}
                  placeholder={"Section One:\nCalculator-free"}
                  className="min-h-16 text-sm"
                />
              ) : (
                <input
                  value={frontMatter.assessmentSubtitle}
                  onChange={(event) => onChange({ assessmentSubtitle: event.target.value })}
                  placeholder="Calculator Free Section"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              )}
            </label>
          </div>
        ) : null}
      </div>
    </CollapsiblePanel>
  );
}
