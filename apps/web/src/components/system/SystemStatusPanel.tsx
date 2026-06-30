import type { ReactNode } from "react";
import type { MauthSystemStatus, ProjectSummary } from "@mauth-studio/shared";
import { RefreshCw, Terminal, X } from "lucide-react";

import type { DraftAutosaveStatus, HeaderSaveStatus } from "@/hooks/useProjectFileStatus";
import type { MauthWebBuildInfo, SystemStatusState } from "@/hooks/useSystemStatusController";
import { Button } from "@/components/ui/button";
import { systemStatusLauncherGuidance, type LauncherCommand } from "@/lib/systemStatusGuidance";
import { cn } from "@/lib/utils";

export function systemStatusTone(state: SystemStatusState) {
  if (state === "ready") return "bg-emerald-400";
  if (state === "loading") return "bg-amber-300";
  return "bg-red-400";
}

function systemStatusTitle(state: SystemStatusState) {
  if (state === "ready") return "System status";
  if (state === "loading") return "Checking system status";
  if (state === "stale-api") return "API is stale";
  if (state === "unavailable") return "API unavailable";
  return "System status error";
}

function formatStatusDateTime(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function compactBuildId(value: string) {
  if (!value) return "unknown";
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatStatusDateTime(value);
  return value.length > 18 ? value.slice(0, 18) : value;
}

function SystemStatusRow({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-slate-200/70 py-2 last:border-b-0 md:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-900">{value || "Unknown"}</dd>
    </div>
  );
}

function LauncherCommandRow({ command }: { command: LauncherCommand }) {
  return (
    <div className="grid gap-1 border-b border-slate-200/70 py-2 last:border-b-0 md:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{command.label}</dt>
      <dd className="min-w-0">
        <code className="block select-all rounded-md bg-slate-950 px-2 py-1.5 font-mono text-xs leading-5 text-slate-50">
          {command.command}
        </code>
      </dd>
    </div>
  );
}

interface SystemStatusPanelProps {
  open: boolean;
  status: MauthSystemStatus | null;
  state: SystemStatusState;
  message: string;
  webBuild: MauthWebBuildInfo;
  activeProject: ProjectSummary | null;
  currentFileName: string;
  activeProjectPathLabel: string;
  activeProjectFileRevision: number | null;
  headerStorageStatus: HeaderSaveStatus;
  draftAutosaveStatus: DraftAutosaveStatus;
  draftAutosaveMessage: string;
  onRefresh: () => void;
  onClose: () => void;
}

export function SystemStatusPanel({
  open,
  status,
  state,
  message,
  webBuild,
  activeProject,
  currentFileName,
  activeProjectPathLabel,
  activeProjectFileRevision,
  headerStorageStatus,
  draftAutosaveStatus,
  draftAutosaveMessage,
  onRefresh,
  onClose,
}: SystemStatusPanelProps) {
  if (!open) return null;

  const workspace = status?.workspace;
  const bridge = status?.bridge;
  const gitSummary = [status?.git.branch, status?.git.commit, status?.git.dirty ? "dirty" : ""].filter(Boolean).join(" · ");
  const activeFolder = workspace?.documentsPath ?? activeProject?.documentsPath ?? activeProject?.workspacePath ?? "";
  const launcherGuidance = systemStatusLauncherGuidance({ state, workspace });
  const bridgeSummary = bridge
    ? `${bridge.activeSessionCount} active session${bridge.activeSessionCount === 1 ? "" : "s"} · ${bridge.pendingRequestCount} pending`
    : "Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-slate-950/35 p-4 pt-20" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-status-title"
        className="max-h-[calc(100vh-6rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-300 bg-white text-slate-950 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", systemStatusTone(state))} aria-hidden="true" />
              <h2 id="system-status-title" className="text-base font-semibold">
                {systemStatusTitle(state)}
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">{message}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Close system status" onClick={onClose}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="space-y-5 p-4">
          <section>
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-slate-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950">{launcherGuidance.title}</h3>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{launcherGuidance.summary}</p>
            <dl className="mt-2 rounded-lg border border-slate-200 px-3">
              <LauncherCommandRow command={launcherGuidance.primaryCommand} />
              {launcherGuidance.commands.map((command) => (
                <LauncherCommandRow key={`${command.label}:${command.command}`} command={command} />
              ))}
            </dl>
            <p className="mt-2 text-xs leading-5 text-slate-500">{launcherGuidance.folderNote}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-950">Process</h3>
            <dl className="mt-2 rounded-lg border border-slate-200 px-3">
              <SystemStatusRow label="Web version" value={`${webBuild.version} · ${compactBuildId(webBuild.buildId)}`} />
              <SystemStatusRow label="API URL" value={webBuild.apiBase} />
              <SystemStatusRow label="Status route" value={status?.routes.systemStatus ?? "/api/system/status"} />
              <SystemStatusRow label="API version" value={status?.apiVersion} />
              <SystemStatusRow label="API started" value={formatStatusDateTime(status?.startedAt)} />
              <SystemStatusRow label="API checked" value={formatStatusDateTime(status?.checkedAt)} />
              <SystemStatusRow label="Git" value={gitSummary || "Unknown"} />
              <SystemStatusRow label="API root" value={status?.root} />
              <SystemStatusRow label="API cwd" value={status?.cwd} />
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-950">Storage</h3>
            <dl className="mt-2 rounded-lg border border-slate-200 px-3">
              <SystemStatusRow label="Current folder" value={activeFolder} />
              <SystemStatusRow label="Default folder" value={workspace?.defaultDocumentsPath} />
              <SystemStatusRow label="Metadata folder" value={workspace?.metadataPath} />
              <SystemStatusRow
                label="Folder mode"
                value={
                  workspace
                    ? workspace.isExternalDocumentsFolder
                      ? "External documents folder"
                      : "Default Mauth documents folder"
                    : "Unknown"
                }
              />
              <SystemStatusRow label="Project" value={activeProject?.name ?? workspace?.defaultProject?.name} />
              <SystemStatusRow label="Active file" value={activeProjectPathLabel || currentFileName} />
              <SystemStatusRow
                label="Revision"
                value={typeof activeProjectFileRevision === "number" ? String(activeProjectFileRevision) : "No file revision"}
              />
              <SystemStatusRow label="Save state" value={headerStorageStatus} />
              <SystemStatusRow label="Autosave" value={`${draftAutosaveStatus} · ${draftAutosaveMessage}`} />
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-950">Agent Bridge</h3>
            <dl className="mt-2 rounded-lg border border-slate-200 px-3">
              <SystemStatusRow label="Bridge" value={bridgeSummary} />
              <SystemStatusRow label="Register route" value={bridge?.routes.browserRegister} />
              <SystemStatusRow
                label="Sessions"
                value={
                  bridge?.sessions.length ? (
                    <div className="space-y-1">
                      {bridge.sessions.map((session) => (
                        <div key={session.sessionId} className="rounded-md bg-slate-50 p-2">
                          <div className="font-medium">{session.label}</div>
                          <div className="text-xs text-slate-600">{session.sessionId}</div>
                          <div className="text-xs text-slate-600">Last seen {formatStatusDateTime(session.lastSeen)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    "No browser bridge session registered"
                  )
                }
              />
            </dl>
          </section>
        </div>
      </section>
    </div>
  );
}
