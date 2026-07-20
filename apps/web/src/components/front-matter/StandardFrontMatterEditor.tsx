import { InlineSummaryTitle } from "@/components/MathText";
import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Textarea } from "@/components/ui/textarea";
import type { FrontMatterConfig } from "@/lib/frontMatterConfig";

interface StandardFrontMatterEditorProps {
  frontMatter: FrontMatterConfig;
  onChange: (patch: Partial<FrontMatterConfig>) => void;
}

export function StandardFrontMatterEditor({ frontMatter, onChange }: StandardFrontMatterEditorProps) {
  return (
    <>
      <CollapsiblePanel
        title={
          <InlineSummaryTitle
            label="Supervisor declaration"
            summary={frontMatter.showDeclaration ? frontMatter.declarationTitle : "Hidden"}
          />
        }
        defaultOpen={false}
        className="bg-muted/20"
        actions={
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={frontMatter.showDeclaration}
              onChange={(event) => onChange({ showDeclaration: event.target.checked })}
            />
            Show
          </label>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
            Heading
            <input
              value={frontMatter.declarationTitle}
              onChange={(event) => onChange({ declarationTitle: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium md:col-span-2">
            Declaration text
            <Textarea
              value={frontMatter.declarationBody}
              onChange={(event) => onChange({ declarationBody: event.target.value })}
              className="min-h-28 text-sm"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Signature label
            <input
              value={frontMatter.signatureLabel}
              onChange={(event) => onChange({ signatureLabel: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Signature role
            <input
              value={frontMatter.signatureRole}
              onChange={(event) => onChange({ signatureRole: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title={
          <InlineSummaryTitle label="Instructions" summary={frontMatter.showInstructions ? frontMatter.instructionsTitle : "Hidden"} />
        }
        defaultOpen={false}
        className="bg-muted/20"
        actions={
          <label className="flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={frontMatter.showInstructions}
              onChange={(event) => onChange({ showInstructions: event.target.checked })}
            />
            Show
          </label>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-xs font-medium">
            Heading
            <input
              value={frontMatter.instructionsTitle}
              onChange={(event) => onChange({ instructionsTitle: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
            Instructions text
            <Textarea
              value={frontMatter.instructionsBody}
              onChange={(event) => onChange({ instructionsBody: event.target.value })}
              className="min-h-36 text-sm"
            />
          </label>
        </div>
      </CollapsiblePanel>
    </>
  );
}
