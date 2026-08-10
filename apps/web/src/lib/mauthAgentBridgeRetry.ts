const MAX_BRIDGE_RETRY_DELAY_MS = 30_000;

interface ApiErrorLike extends Error {
  status: number;
  detail?: unknown;
}

function isApiError(error: unknown): error is ApiErrorLike {
  return error instanceof Error && error.name === "ApiError" && typeof (error as Partial<ApiErrorLike>).status === "number";
}

function apiErrorCode(error: ApiErrorLike) {
  if (!error.detail || typeof error.detail !== "object") return null;
  const body = error.detail as Record<string, unknown>;
  const detail = body.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : body;
  return typeof detail.code === "string" ? detail.code : null;
}

export function isLostBrowserSession(error: unknown) {
  return isApiError(error) && error.status === 404 && apiErrorCode(error) === "APP_NOT_CONNECTED";
}

export function bridgeRetryDelayMs(error: unknown, registered: boolean, retryAttempt: number): number | null {
  if (isApiError(error)) {
    if (error.status === 401 || error.status === 403 || error.status === 405) return null;
    if (error.status === 404 && !isLostBrowserSession(error)) return null;
  }

  const baseDelay = registered ? 1_000 : 1_500;
  return Math.min(MAX_BRIDGE_RETRY_DELAY_MS, baseDelay * 2 ** Math.max(0, retryAttempt));
}
