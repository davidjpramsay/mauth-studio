import type { ComponentProps } from "react";

import { RemoveActionButton } from "@/components/editor/EditorPanels";
import { FrontMatterEditor } from "@/components/front-matter/FrontMatterEditor";
import type { DocumentSectionHeading } from "@/lib/editorDocumentNormalization";
import { standardSectionTitlePageChange, standardSectionTitlePageFrontMatter } from "@/lib/standardTestTitlePage";

type FrontMatterEditorProps = ComponentProps<typeof FrontMatterEditor>;

export function StandardSectionTitlePageEditor({
  heading,
  sectionMarks,
  sectionQuestionCount,
  frontMatterProps,
  onChangeHeading,
  onRemove,
}: {
  heading: DocumentSectionHeading;
  sectionMarks: number;
  sectionQuestionCount: number;
  frontMatterProps: FrontMatterEditorProps;
  onChangeHeading: (patch: Partial<DocumentSectionHeading>) => void;
  onRemove: () => void;
}) {
  const effectiveFrontMatter = standardSectionTitlePageFrontMatter(frontMatterProps.frontMatter, heading);

  function handleChange(patch: Partial<FrontMatterEditorProps["frontMatter"]>) {
    const change = standardSectionTitlePageChange(heading, patch);
    if (Object.keys(change.sharedPatch).length) frontMatterProps.onChange(change.sharedPatch);
    if (Object.keys(change.headingPatch).length) onChangeHeading(change.headingPatch);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Title page</h2>
          <p className="text-xs text-muted-foreground">
            {sectionQuestionCount} {sectionQuestionCount === 1 ? "question" : "questions"} · {sectionMarks}{" "}
            {sectionMarks === 1 ? "mark" : "marks"}
          </p>
        </div>
        <RemoveActionButton label="Remove section title page" onRemove={onRemove} />
      </div>
      <FrontMatterEditor
        {...frontMatterProps}
        frontMatter={effectiveFrontMatter}
        questionCount={sectionQuestionCount}
        totalMarks={sectionMarks}
        onChange={handleChange}
      />
    </div>
  );
}
