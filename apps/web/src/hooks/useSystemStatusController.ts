import { useCallback, useEffect, useMemo, useState } from "react";
import type { MauthSystemStatus } from "@mauth-studio/shared";

import { ApiError, API_BASE, getSystemStatus } from "@/lib/api";

const SYSTEM_STATUS_POLL_INTERVAL_MS = 15000;

export type SystemStatusState = "loading" | "ready" | "stale-api" | "unavailable" | "error";

export interface MauthWebBuildInfo {
  version: string;
  buildId: string;
  apiBase: string;
}

export interface SystemStatusController {
  status: MauthSystemStatus | null;
  state: SystemStatusState;
  message: string;
  webBuild: MauthWebBuildInfo;
  refresh: () => Promise<void>;
}

function systemStatusMessage(state: SystemStatusState, error: unknown) {
  if (state === "loading") return "Checking system status";
  if (state === "ready") return "System status ready";
  if (state === "stale-api") return "API is stale or missing /api/system/status. Restart the API server.";
  if (state === "unavailable") return "API is unavailable. Start or restart the API server.";
  return error instanceof Error ? error.message : "System status check failed";
}

function classifyStatusError(error: unknown): SystemStatusState {
  if (error instanceof ApiError && error.status === 404) return "stale-api";
  if (error instanceof TypeError) return "unavailable";
  return "error";
}

export function useSystemStatusController(): SystemStatusController {
  const [status, setStatus] = useState<MauthSystemStatus | null>(null);
  const [state, setState] = useState<SystemStatusState>("loading");
  const [message, setMessage] = useState("Checking system status");
  const webBuild: MauthWebBuildInfo = useMemo(
    () => ({
      version: __MAUTH_WEB_VERSION__,
      buildId: __MAUTH_WEB_BUILD_ID__,
      apiBase: API_BASE,
    }),
    [],
  );

  const refreshWithSignal = useCallback(async (signal?: AbortSignal) => {
    try {
      const nextStatus = await getSystemStatus(signal);
      setStatus(nextStatus);
      setState("ready");
      setMessage(systemStatusMessage("ready", null));
    } catch (error) {
      if (signal?.aborted) return;
      const nextState = classifyStatusError(error);
      setStatus(null);
      setState(nextState);
      setMessage(systemStatusMessage(nextState, error));
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    void refreshWithSignal(abortController.signal);
    const intervalId = window.setInterval(() => void refreshWithSignal(abortController.signal), SYSTEM_STATUS_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      abortController.abort();
    };
  }, [refreshWithSignal]);

  return {
    status,
    state,
    message,
    webBuild,
    refresh: () => refreshWithSignal(),
  };
}
