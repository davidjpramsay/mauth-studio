export type SystemStatusGuidanceState = "loading" | "ready" | "stale-api" | "unavailable" | "error";

export interface SystemStatusGuidanceWorkspace {
  isExternalDocumentsFolder?: boolean;
  documentsPath?: string;
  defaultDocumentsPath?: string;
}

export interface SystemStatusGuidanceInput {
  state: SystemStatusGuidanceState;
  workspace?: SystemStatusGuidanceWorkspace | null;
}

export interface LauncherCommand {
  label: string;
  command: string;
}

export interface SystemStatusLauncherGuidance {
  title: string;
  summary: string;
  primaryCommand: LauncherCommand;
  commands: LauncherCommand[];
  folderNote: string;
}

export interface SystemStatusActiveFileInput {
  editorDocumentOpen: boolean;
  currentFileName?: string;
  activeProjectPathLabel?: string;
  activeProjectFileRevision?: number | null;
}

const HEALTHY_COMMANDS: LauncherCommand[] = [
  { label: "Check running servers", command: "pnpm dev:status" },
  { label: "Stop local Mauth servers", command: "pnpm dev:stop" },
  { label: "Clean restart", command: "pnpm dev:launch:replace" },
  { label: "Install or reveal Mac launcher", command: "pnpm macos:install-launcher --reveal" },
];

function folderNote(workspace?: SystemStatusGuidanceWorkspace | null) {
  if (!workspace) return "Folder state is not available yet.";
  if (workspace.isExternalDocumentsFolder) {
    return `Mauth is using an external documents folder: ${workspace.documentsPath || "unknown"}.`;
  }
  return `Mauth is using the default documents folder: ${workspace.defaultDocumentsPath || workspace.documentsPath || "unknown"}.`;
}

export function systemStatusActiveFileLabel({ editorDocumentOpen, currentFileName, activeProjectPathLabel }: SystemStatusActiveFileInput) {
  if (!editorDocumentOpen) return "No file open";
  return activeProjectPathLabel || currentFileName || "Untitled test";
}

export function systemStatusRevisionLabel({ editorDocumentOpen, activeProjectFileRevision }: SystemStatusActiveFileInput) {
  if (!editorDocumentOpen) return "No file open";
  return typeof activeProjectFileRevision === "number" ? String(activeProjectFileRevision) : "No file revision";
}

export function systemStatusLauncherGuidance({ state, workspace }: SystemStatusGuidanceInput): SystemStatusLauncherGuidance {
  if (state === "stale-api") {
    return {
      title: "Restart with the launcher",
      summary:
        "The web app can reach an API, but it is not the current Mauth API. Use a clean launcher restart so the API and web app match.",
      primaryCommand: { label: "Clean restart", command: "pnpm dev:launch:replace" },
      commands: [
        { label: "Check what is running", command: "pnpm dev:status" },
        { label: "Stop local Mauth servers", command: "pnpm dev:stop" },
        { label: "Desktop-safe launch", command: "pnpm dev:launch:desktop" },
      ],
      folderNote: folderNote(workspace),
    };
  }

  if (state === "unavailable") {
    return {
      title: "Start Mauth",
      summary: "The API is not reachable. Start Mauth through the launcher so the API, web app, and status checks come up together.",
      primaryCommand: { label: "Start desktop launcher", command: "pnpm dev:launch:desktop" },
      commands: [
        { label: "Check running servers", command: "pnpm dev:status" },
        { label: "Install or reveal Mac launcher", command: "pnpm macos:install-launcher --reveal" },
      ],
      folderNote: folderNote(workspace),
    };
  }

  if (state === "error") {
    return {
      title: "Check or restart Mauth",
      summary: "The status check failed. Check the running servers first, then use a clean restart if the state still looks wrong.",
      primaryCommand: { label: "Check running servers", command: "pnpm dev:status" },
      commands: [
        { label: "Clean restart", command: "pnpm dev:launch:replace" },
        { label: "Stop local Mauth servers", command: "pnpm dev:stop" },
        { label: "Desktop-safe launch", command: "pnpm dev:launch:desktop" },
      ],
      folderNote: folderNote(workspace),
    };
  }

  if (state === "loading") {
    return {
      title: "Checking Mauth",
      summary: "Mauth is checking the local API and web app state. If this does not settle, check the local launcher status.",
      primaryCommand: { label: "Check running servers", command: "pnpm dev:status" },
      commands: [
        { label: "Clean restart", command: "pnpm dev:launch:replace" },
        { label: "Install or reveal Mac launcher", command: "pnpm macos:install-launcher --reveal" },
      ],
      folderNote: folderNote(workspace),
    };
  }

  return {
    title: "Launcher commands",
    summary: "Use the launcher commands from the Mauth repo root so the API, web app, system status, and browser bridge stay aligned.",
    primaryCommand: { label: "Start desktop launcher", command: "pnpm dev:launch:desktop" },
    commands: HEALTHY_COMMANDS,
    folderNote: folderNote(workspace),
  };
}
