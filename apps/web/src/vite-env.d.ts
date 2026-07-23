/// <reference types="vite/client" />

declare const __MAUTH_WEB_BUILD_ID__: string;
declare const __MAUTH_WEB_VERSION__: string;

interface Window {
  mauthDesktop?: {
    getAgentConnectorInfo: () => Promise<MauthAgentConnectorInfo>;
    onOpenAgentSetup: (listener: () => void) => () => void;
    onOpenDocument: (listener: (filePath: string) => void) => () => void;
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
