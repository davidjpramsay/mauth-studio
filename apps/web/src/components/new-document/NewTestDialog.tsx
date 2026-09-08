import { ClipboardList, Columns3, FileText, Heading2, ListTree } from "lucide-react";

import { MauthDialog } from "@/components/ui/mauth-dialog";
import type { TitlePageTemplate } from "@/lib/frontMatterConfig";
import type { FormattingConfig } from "@mauth-studio/shared";

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
  {
    id: "investigation",
    title: "Investigation",
    description: "Single-page test-style brief with shared marking guidance and a linked teacher rubric.",
    formatPresetId: "investigation",
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
    <MauthDialog title="New document" onClose={onClose} className="max-w-4xl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {NEW_TEST_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onCreate(template.id)}
            className="group flex min-h-28 flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition hover:border-primary hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 items-center justify-center rounded-md border bg-background text-primary transition group-hover:border-primary">
              {template.id === "exam" ? (
                <ListTree className="size-5" aria-hidden="true" />
              ) : template.id === "worksheet" ? (
                <Columns3 className="size-5" aria-hidden="true" />
              ) : template.id === "notes" ? (
                <Heading2 className="size-5" aria-hidden="true" />
              ) : template.id === "investigation" ? (
                <ClipboardList className="size-5" aria-hidden="true" />
              ) : (
                <FileText className="size-5" aria-hidden="true" />
              )}
            </span>
            <span className="text-base font-semibold">{template.title}</span>
          </button>
        ))}
      </div>
    </MauthDialog>
  );
}
