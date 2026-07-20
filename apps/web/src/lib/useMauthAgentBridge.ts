import { useEffect, useMemo, useRef } from "react";
import type { MauthAgentQueuedRequest } from "@mauth-studio/shared";

import {
  ApiError,
  pollMauthAgentRequests,
  registerMauthAgentEditorSession,
  respondMauthAgentRequest,
  unregisterMauthAgentEditorSession,
} from "@/lib/api";

const EDITOR_SESSION_STORAGE_KEY = "mauth-agent-editor-session-id";

export interface MauthAgentBridgeHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export interface MauthAgentBridgeHandlers {
  snapshot: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
  preview: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
  apply: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
  validation: (payload: Record<string, unknown>) => MauthAgentBridgeHandlerResult | Promise<MauthAgentBridgeHandlerResult>;
}

export interface UseMauthAgentBridgeOptions {
  enabled: boolean;
  handlers: MauthAgentBridgeHandlers;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function bridgeSessionId() {
  const existing = window.sessionStorage.getItem(EDITOR_SESSION_STORAGE_KEY);
  if (existing) return existing;

  const next = `editor_${crypto.randomUUID()}`;
  window.sessionStorage.setItem(EDITOR_SESSION_STORAGE_KEY, next);
  return next;
}

function errorBody(code: string, error: string): Record<string, unknown> {
  return { success: false, code, error };
}

function unknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The browser bridge failed while handling the agent request.";
}

function isLostBrowserSession(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 404 || !error.detail || typeof error.detail !== "object") return false;
  return (error.detail as Record<string, unknown>).code === "APP_NOT_CONNECTED";
}

async function runHandler(request: MauthAgentQueuedRequest, handlers: MauthAgentBridgeHandlers): Promise<MauthAgentBridgeHandlerResult> {
  try {
    switch (request.kind) {
      case "snapshot":
        return await handlers.snapshot(request.payload);
      case "actions.preview":
        return await handlers.preview(request.payload);
      case "actions.apply":
        return await handlers.apply(request.payload);
      case "validation.run":
        return await handlers.validation(request.payload);
      default:
        return {
          status: 400,
          body: errorBody("INVALID_REQUEST", `Unsupported agent request kind: ${request.kind}`),
        };
    }
  } catch (error) {
    return {
      status: 500,
      body: errorBody("ACTION_FAILED", unknownErrorMessage(error)),
    };
  }
}

export function useMauthAgentBridge({ enabled, handlers }: UseMauthAgentBridgeOptions) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const sessionId = useMemo(bridgeSessionId, []);

  useEffect(() => {
    if (!enabled) return;

    const abortController = new AbortController();
    let stopped = false;
    let registered = false;
    let unregistering = false;

    async function runBridgeLoop() {
      while (!stopped) {
        try {
          if (!registered) {
            await registerMauthAgentEditorSession(sessionId, "Mauth web editor", abortController.signal);
            registered = true;
          }

          const response = await pollMauthAgentRequests(sessionId, abortController.signal);
          if (!response.request) continue;

          const handlerResult = await runHandler(response.request, handlersRef.current);
          await respondMauthAgentRequest(
            {
              sessionId,
              requestId: response.request.requestId,
              status: handlerResult.status,
              body: handlerResult.body,
            },
            abortController.signal,
          );
        } catch (error) {
          if (stopped || abortController.signal.aborted) return;
          if (isLostBrowserSession(error)) registered = false;
          await delay(registered ? 1000 : 1500);
        }
      }
    }

    function unregisterClosedPage() {
      if (unregistering) return;
      unregistering = true;
      void unregisterMauthAgentEditorSession(sessionId).catch(() => undefined);
    }

    window.addEventListener("pagehide", unregisterClosedPage);
    window.addEventListener("beforeunload", unregisterClosedPage);
    void runBridgeLoop();

    return () => {
      stopped = true;
      abortController.abort();
      window.removeEventListener("pagehide", unregisterClosedPage);
      window.removeEventListener("beforeunload", unregisterClosedPage);
    };
  }, [enabled, sessionId]);
}
