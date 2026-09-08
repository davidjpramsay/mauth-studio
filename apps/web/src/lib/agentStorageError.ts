export function agentStorageError(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const body = record.detail && typeof record.detail === "object" ? (record.detail as Record<string, unknown>) : {};
  const detail = body.detail && typeof body.detail === "object" ? (body.detail as Record<string, unknown>) : body;
  const status = typeof record.status === "number" ? record.status : 500;
  return {
    status,
    body: {
      success: false,
      code:
        typeof detail.code === "string"
          ? detail.code
          : status === 503
            ? "STORAGE_UNAVAILABLE"
            : status === 409
              ? "FILE_CONFLICT"
              : status === 404
                ? "DOCUMENT_NOT_FOUND"
                : "ACTION_FAILED",
      error: error instanceof Error ? error.message : "The document operation failed.",
      ...(typeof detail.reason === "string" ? { reason: detail.reason } : {}),
      ...(typeof detail.action === "string" ? { action: detail.action } : {}),
      ...(typeof detail.path === "string" ? { path: detail.path } : {}),
      retryable: detail.retryable === true || status === 503,
      documentOpened: false,
    },
  };
}
