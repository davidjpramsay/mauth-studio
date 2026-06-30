import { Columns3, FileText, Heading2, ListTree, PlusCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FormattingConfig } from "@mauth-studio/shared";

export type TitlePageTemplate = "standard" | "exam" | "worksheet" | "notes";

export const NEW_TEST_TEMPLATES: Array<{
  id: TitlePageTemplate;
  title: string;
  description: string;
  formatPresetId: FormattingConfig["id"];
}> = [
  {
    id: "standard",
    title: "School test",
    description: "Single Mauth title page with school logo, name line, marks, declaration, and test conditions.",
    formatPresetId: "high-school-mathematics-test",
  },
  {
    id: "exam",
    title: "School exam booklet",
    description: "School-logo exam cover, structure page, running headers, question footers, and supplementary pages.",
    formatPresetId: "exam-booklet",
  },
  {
    id: "worksheet",
    title: "Worksheet",
    description: "Compact heading with questions starting immediately on the first page.",
    formatPresetId: "worksheet",
  },
  {
    id: "notes",
    title: "Math notes",
    description: "Printable notes with headings, Markdown-style text, diagrams, tables, columns, and examples.",
    formatPresetId: "math-notes",
  },
];

export function NewTestDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (template: TitlePageTemplate) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={onClose}>
      <section
        className="w-full max-w-4xl rounded-xl border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-test-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex min-w-0 items-center gap-2">
            <PlusCircle className="size-5 text-primary" aria-hidden="true" />
            <h2 id="new-test-dialog-title" className="truncate text-base font-semibold">
              New document
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" title="Close new document" aria-label="Close new document" onClick={onClose}>
            <X />
          </Button>
        </header>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          {NEW_TEST_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onCreate(template.id)}
              className="group flex min-h-40 flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-10 items-center justify-center rounded-md border bg-background text-primary transition group-hover:border-primary">
                {template.id === "exam" ? (
                  <ListTree className="size-5" aria-hidden="true" />
                ) : template.id === "worksheet" ? (
                  <Columns3 className="size-5" aria-hidden="true" />
                ) : template.id === "notes" ? (
                  <Heading2 className="size-5" aria-hidden="true" />
                ) : (
                  <FileText className="size-5" aria-hidden="true" />
                )}
              </span>
              <span className="text-lg font-semibold">{template.title}</span>
              <span className="text-sm leading-6 text-muted-foreground">{template.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
