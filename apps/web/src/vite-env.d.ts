/// <reference types="vite/client" />

declare const __MAUTH_WEB_BUILD_ID__: string;
declare const __MAUTH_WEB_VERSION__: string;

interface Window {
  mauthDesktop?: {
    openDocuments?: () => Promise<boolean>;
    chooseDocumentSavePath?: (defaultPath: string) => Promise<string | null>;
    revealDocument?: (filePath: string) => Promise<void>;
    rememberDocument?: (filePath: string) => Promise<void>;
    onFileCommand?: (listener: (command: string) => void) => () => void;
    getAgentConnectorInfo: () => Promise<MauthAgentConnectorInfo>;
    chooseDocumentsFolder: () => Promise<MauthDocumentsFolderSelection>;
    requestWindowClose: () => Promise<boolean>;
    onOpenAgentSetup: (listener: () => void) => () => void;
    onOpenSystemStatus: (listener: () => void) => () => void;
    onOpenSolutionValidation: (listener: () => void) => () => void;
    onCloseActiveDocument: (listener: () => void) => () => void;
    onOpenDocument: (listener: (filePath: string) => void) => () => void;
    onToggleTheme: (listener: () => void) => () => void;
  };
}

interface MauthAgentConnectorInfo {
  available: boolean;
  bundled: boolean;
  version: string;
  connectorPath: string | null;
  launchCommand: string;
  launchArgs: string[];
  codexSetupCommand: string;
  claudeCodeSetupCommand: string;
  claudeDesktopConfiguration: string;
  doctorCommand: string;
}

interface MauthDocumentsFolderSelection {
  cancelled: boolean;
  path: string | null;
}

declare module "*.css";

declare module "plotly.js-dist-min" {
  const Plotly: {
    newPlot: (element: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => Promise<unknown>;
    react: (element: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => Promise<unknown>;
    purge: (element: HTMLElement) => void;
    Plots?: {
      resize: (element: HTMLElement) => void;
    };
  };
  export default Plotly;
}
