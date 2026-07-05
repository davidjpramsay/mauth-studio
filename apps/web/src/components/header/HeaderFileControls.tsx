import { FolderOpen, PlusCircle, Save, X } from "lucide-react";

import type { HeaderSaveStatus } from "@/hooks/useProjectFileStatus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HEADER_ICON_BUTTON_CLASS = "size-8 text-blue-100 hover:bg-blue-500/15 hover:text-white disabled:opacity-40";

function storageStatusTone(status: HeaderSaveStatus) {
  if (status === "saved" || status === "ready") return "bg-emerald-400";
  if (status === "draft") return "bg-amber-300";
  if (status === "saving" || status === "loading") return "bg-amber-300";
  if (status === "dirty") return "bg-orange-300";
  return "bg-red-400";
}

interface HeaderFileControlsProps {
  currentFileName: string;
  fileStatusMessage: string;
  fileStatusTitle: string;
  saveStatus: HeaderSaveStatus;
  documentOpen: boolean;
  onNewTest: () => void;
  onSaveTest: () => void;
  onOpenFiles: () => void;
  onCloseFile: () => void;
}

export function HeaderFileControls({
  currentFileName,
  fileStatusMessage,
  fileStatusTitle,
  saveStatus,
  documentOpen,
  onNewTest,
  onSaveTest,
  onOpenFiles,
  onCloseFile,
}: HeaderFileControlsProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-blue-300/20 bg-white/[0.05] p-1">
      <span className={cn("ml-1 size-2 shrink-0 rounded-full", storageStatusTone(saveStatus))} title={fileStatusTitle} aria-hidden="true" />
      <div
        className="flex h-8 min-w-0 max-w-[30rem] flex-1 flex-col justify-center rounded-md border border-blue-300/20 bg-[#050b1d] px-2"
        title={fileStatusTitle}
      >
        <span className="truncate text-sm font-medium leading-tight text-blue-50">{currentFileName}</span>
        <span className="truncate text-[10px] leading-tight text-blue-100/70">{fileStatusMessage}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="New document"
        aria-label="New document"
        onClick={onNewTest}
        className={cn(HEADER_ICON_BUTTON_CLASS, "shrink-0")}
      >
        <PlusCircle />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Save current test"
        aria-label="Save current test"
        disabled={!documentOpen}
        onClick={onSaveTest}
        className={cn(HEADER_ICON_BUTTON_CLASS, "shrink-0")}
      >
        <Save />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        title="Open files"
        aria-label="Open files"
        onClick={onOpenFiles}
        className="h-8 shrink-0 border border-blue-300/15 px-2 text-blue-100 hover:bg-blue-500/15 hover:text-white"
      >
        <FolderOpen className="size-4" aria-hidden="true" />
        Files
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Close current file"
        aria-label="Close current file"
        disabled={!documentOpen}
        onClick={onCloseFile}
        className={cn(HEADER_ICON_BUTTON_CLASS, "shrink-0")}
      >
        <X />
      </Button>
    </div>
  );
}
