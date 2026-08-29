import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { normalizeFormulaSheet, type FrontMatterConfig, type FormulaSheetConfig } from "@/lib/frontMatterConfig";

interface FormulaSheetEditorProps {
  frontMatter: FrontMatterConfig;
  onChange: (patch: Partial<FrontMatterConfig>) => void;
}

export function FormulaSheetEditor({ frontMatter, onChange }: FormulaSheetEditorProps) {
  const formulaSheet = normalizeFormulaSheet(frontMatter.formulaSheet);
  const updateFormulaSheet = (patch: Partial<FormulaSheetConfig>) => onChange({ formulaSheet: { ...formulaSheet, ...patch } });

  return (
    <div className="rounded-lg border bg-card p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            F
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Formula sheet</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              One unnumbered page after the opening title page in both Student and Solutions copies.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateFormulaSheet({ enabled: false })}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Heading
          <input
            value={formulaSheet.title}
            onChange={(event) => updateFormulaSheet({ title: event.target.value })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium">
          Formula sheet text
          <Textarea
            value={formulaSheet.body}
            onChange={(event) => updateFormulaSheet({ body: event.target.value })}
            className="min-h-96 font-mono text-sm"
            placeholder={"Use a blank line between sections. Write maths with $...$ or $$...$$."}
          />
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Blank-line sections flow into two print columns. Use Markdown emphasis and the normal MathJax syntax for formulas.
        </p>
      </div>
    </div>
  );
}
