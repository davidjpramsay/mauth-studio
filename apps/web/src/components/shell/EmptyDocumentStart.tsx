import { FileText, FolderOpen, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type EmptyDocumentStartProps = {
  onNewDocument: () => void;
  onOpenFiles: () => void;
};

export function EmptyDocumentStart({ onNewDocument, onOpenFiles }: EmptyDocumentStartProps) {
  return (
    <section className="flex min-h-0 items-center justify-center bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.12),transparent_38%),linear-gradient(180deg,#f8fbff_0%,#eef3fb_100%)] p-6">
      <div className="flex max-w-xl flex-col items-center text-center">
        <div className="relative mb-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="New document"
            aria-label="Create a new Mauth document"
            onClick={onNewDocument}
            className="size-24 rounded-full border border-blue-200 bg-white text-blue-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-blue-700 hover:shadow-md focus-visible:ring-blue-500 [&_svg]:size-14"
          >
            <FileText aria-hidden="true" />
          </Button>
        </div>
        <p
          className="text-4xl leading-tight text-slate-800 sm:text-5xl"
          style={{ fontFamily: '"Apple Chancery", "Snell Roundhand", "Brush Script MT", cursive' }}
        >
          Create a new Mauth document to begin.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={onNewDocument} className="gap-2">
            <PlusCircle className="size-4" aria-hidden="true" />
            New document
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onOpenFiles}
            className="gap-2 border-slate-500 bg-white/90 text-slate-800 shadow-sm hover:bg-white hover:text-slate-950"
          >
            <FolderOpen className="size-4" aria-hidden="true" />
            Open files
          </Button>
        </div>
      </div>
    </section>
  );
}
