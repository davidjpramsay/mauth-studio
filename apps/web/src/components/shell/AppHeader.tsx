import { FolderOpen, Moon, PanelRightClose, PanelRightOpen, PlusCircle, Redo2, Save, Server, Sun, Undo2, X } from "lucide-react";

import { HeaderFileControls } from "@/components/header/HeaderFileControls";
import { SolutionModeControls } from "@/components/solutions/SolutionModeControls";
import { systemStatusTone } from "@/components/system/SystemStatusPanel";
import { Button } from "@/components/ui/button";
import type { HeaderSaveStatus } from "@/hooks/useProjectFileStatus";
import type { SystemStatusState } from "@/hooks/useSystemStatusController";
import { cn } from "@/lib/utils";

const BRAND_LOGO_SRC = "/brand/mauth_logo_lockup.png";
const HEADER_GROUP_CLASS = "ml-2 flex shrink-0 items-center gap-1 rounded-md border border-blue-300/20 bg-white/[0.05] p-1";
const HEADER_ICON_BUTTON_CLASS = "size-8 text-blue-100 hover:bg-blue-500/15 hover:text-white disabled:opacity-40";
const HEADER_ICON_ACTIVE_CLASS = "bg-blue-500/20 text-white";

type PaneMode = "split" | "preview";

function ManualModeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7.5v9" strokeWidth="2" />
      <path d="M13 7.5v9" strokeWidth="2" />
      <path d="M7 12h12" strokeWidth="2" />
      <path d="M19 12V7.6" strokeWidth="2" />
      <circle cx="7" cy="5.5" r="2.1" strokeWidth="2" />
      <circle cx="7" cy="18.5" r="2.1" strokeWidth="2" />
      <circle cx="13" cy="5.5" r="2.1" strokeWidth="2" />
      <circle cx="13" cy="18.5" r="2.1" strokeWidth="2" />
      <circle cx="19" cy="5.5" r="2.1" strokeWidth="2" fill="currentColor" />
    </svg>
  );
}

export interface AppHeaderProps {
  paneMode: PaneMode;
  showInspectorPane: boolean;
  editorDocumentOpen: boolean;
  currentProjectFileName: string;
  headerFileStatusMessage: string;
  headerFileStatusTitle: string;
  headerStorageStatus: HeaderSaveStatus;
  systemStatusMessage: string;
  systemStatusState: SystemStatusState;
  darkMode: boolean;
  supportsSolutionTools: boolean;
  showSolutions: boolean;
  effectiveShowSolutions: boolean;
  printModeLabel: string;
  printModeTitle: string;
  solutionIssueCount: number;
  solutionErrorCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onToggleManualPane: () => void;
  onToggleInspectorPane: () => void;
  onNewTest: () => void;
  onSaveTest: () => void;
  onOpenFiles: () => void;
  onOpenSystemStatus: () => void;
  onCloseFile: () => void;
  onToggleTheme: () => void;
  onShowSolutionsChange: (showSolutions: boolean) => void;
  onOpenSolutionValidation: () => void;
  onPrint: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function AppHeader({
  paneMode,
  showInspectorPane,
  editorDocumentOpen,
  currentProjectFileName,
  headerFileStatusMessage,
  headerFileStatusTitle,
  headerStorageStatus,
  systemStatusMessage,
  systemStatusState,
  darkMode,
  supportsSolutionTools,
  showSolutions,
  effectiveShowSolutions,
  printModeLabel,
  printModeTitle,
  solutionIssueCount,
  solutionErrorCount,
  canUndo,
  canRedo,
  onToggleManualPane,
  onToggleInspectorPane,
  onNewTest,
  onSaveTest,
  onOpenFiles,
  onOpenSystemStatus,
  onCloseFile,
  onToggleTheme,
  onShowSolutionsChange,
  onOpenSolutionValidation,
  onPrint,
  onUndo,
  onRedo,
}: AppHeaderProps) {
  return (
    <header className="app-header border-b border-blue-300/15 bg-[#030817] text-white shadow-[0_14px_32px_rgba(3,8,23,0.22)]">
      <div className="flex min-h-16 items-center justify-between gap-4 px-5">
        <div className="flex shrink-0 items-center gap-3">
          <img
            src={BRAND_LOGO_SRC}
            alt="Mauth Studio"
            className="h-10 w-auto max-w-[190px] rounded-md border border-white/10 bg-[#020615] object-contain"
          />
          <div className="flex items-center gap-1 rounded-md border border-blue-300/20 bg-white/[0.05] p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={paneMode === "split" ? "Hide editor" : "Manual editor mode"}
              aria-label={paneMode === "split" ? "Hide editor" : "Manual editor mode"}
              aria-pressed={paneMode === "split"}
              onClick={onToggleManualPane}
              className={cn(HEADER_ICON_BUTTON_CLASS, paneMode === "split" && HEADER_ICON_ACTIVE_CLASS)}
            >
              <ManualModeIcon className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={showInspectorPane ? "Hide inspector" : "Show inspector"}
              aria-label={showInspectorPane ? "Hide inspector" : "Show inspector"}
              aria-pressed={showInspectorPane}
              onClick={onToggleInspectorPane}
              className={cn(HEADER_ICON_BUTTON_CLASS, showInspectorPane && HEADER_ICON_ACTIVE_CLASS)}
            >
              {showInspectorPane ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="New document"
            aria-label="New document"
            onClick={onNewTest}
            className={HEADER_ICON_BUTTON_CLASS}
          >
            <PlusCircle />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Save current test"
            aria-label="Save current test"
            disabled={!editorDocumentOpen}
            onClick={onSaveTest}
            className={HEADER_ICON_BUTTON_CLASS}
          >
            <Save />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Open files"
            aria-label="Open files"
            onClick={onOpenFiles}
            className={HEADER_ICON_BUTTON_CLASS}
          >
            <FolderOpen />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={systemStatusMessage}
            aria-label="System status"
            onClick={onOpenSystemStatus}
            className={cn(HEADER_ICON_BUTTON_CLASS, "relative", systemStatusState !== "ready" && "text-red-100")}
          >
            <Server />
            <span className={cn("absolute right-1 top-1 size-2 rounded-full", systemStatusTone(systemStatusState))} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Close current file"
            aria-label="Close current file"
            disabled={!editorDocumentOpen}
            onClick={onCloseFile}
            className={HEADER_ICON_BUTTON_CLASS}
          >
            <X />
          </Button>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 md:flex">
          <HeaderFileControls
            currentFileName={currentProjectFileName}
            fileStatusMessage={headerFileStatusMessage}
            fileStatusTitle={headerFileStatusTitle}
            saveStatus={headerStorageStatus}
            documentOpen={editorDocumentOpen}
            onNewTest={onNewTest}
            onSaveTest={onSaveTest}
            onOpenFiles={onOpenFiles}
            onCloseFile={onCloseFile}
          />
          <div className={HEADER_GROUP_CLASS}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={systemStatusMessage}
              aria-label="System status"
              onClick={onOpenSystemStatus}
              className={cn(HEADER_ICON_BUTTON_CLASS, "relative", systemStatusState !== "ready" && "text-red-100")}
            >
              <Server />
              <span className={cn("absolute right-1 top-1 size-2 rounded-full", systemStatusTone(systemStatusState))} aria-hidden="true" />
            </Button>
          </div>
          <div className={HEADER_GROUP_CLASS}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={darkMode}
              onClick={onToggleTheme}
              className={cn(HEADER_ICON_BUTTON_CLASS, darkMode && HEADER_ICON_ACTIVE_CLASS)}
            >
              {darkMode ? <Sun /> : <Moon />}
            </Button>
          </div>
          <div className={HEADER_GROUP_CLASS}>
            <SolutionModeControls
              editorDocumentOpen={editorDocumentOpen}
              supportsSolutionTools={supportsSolutionTools}
              showSolutions={showSolutions}
              effectiveShowSolutions={effectiveShowSolutions}
              printModeLabel={printModeLabel}
              printModeTitle={printModeTitle}
              solutionIssueCount={solutionIssueCount}
              solutionErrorCount={solutionErrorCount}
              onShowSolutionsChange={onShowSolutionsChange}
              onOpenSolutionValidation={onOpenSolutionValidation}
              onPrint={onPrint}
            />
          </div>
          <div className={HEADER_GROUP_CLASS}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Undo"
              aria-label="Undo"
              disabled={!editorDocumentOpen || !canUndo}
              onClick={onUndo}
              className={HEADER_ICON_BUTTON_CLASS}
            >
              <Undo2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Redo"
              aria-label="Redo"
              disabled={!editorDocumentOpen || !canRedo}
              onClick={onRedo}
              className={HEADER_ICON_BUTTON_CLASS}
            >
              <Redo2 />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
