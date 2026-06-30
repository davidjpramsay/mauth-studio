import type { ProjectSaveConflict } from "@/hooks/useProjectFilesController";
import { Button } from "@/components/ui/button";

interface ProjectFileConflictBannerProps {
  conflict: ProjectSaveConflict | null;
  disabled?: boolean;
  onSaveRecoveryCopy: () => void;
  onReloadFromDisk: () => void;
}

export function ProjectFileConflictBanner({
  conflict,
  disabled = false,
  onSaveRecoveryCopy,
  onReloadFromDisk,
}: ProjectFileConflictBannerProps) {
  if (!conflict) return null;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">File changed outside Mauth</h2>
          <p className="mt-1 text-sm leading-6">{conflict.message}</p>
          <p className="mt-1 text-xs text-amber-800">
            {typeof conflict.localRevision === "number" ? `Loaded revision ${conflict.localRevision}` : "Loaded revision unknown"}
            {typeof conflict.currentRevision === "number" ? ` · disk revision ${conflict.currentRevision}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onSaveRecoveryCopy}
            className="border-amber-500 bg-white text-amber-950 hover:bg-amber-100"
          >
            Save recovery copy
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={onReloadFromDisk}
            className="bg-amber-700 text-white hover:bg-amber-800"
          >
            Reload from disk
          </Button>
        </div>
      </div>
    </section>
  );
}
