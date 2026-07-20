export const PROJECT_FILES_UNAVAILABLE_MESSAGE = "Files unavailable";

export function isProjectFilesUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = "status" in error ? error.status : undefined;
  if (status === 503) return true;
  return /fetch failed|failed to fetch|network error|networkerror/i.test(error.message);
}

export function projectFilesUnavailableMessage(error: unknown) {
  if (error instanceof Error && "status" in error && error.status === 503 && error.message.trim()) return error.message;
  return PROJECT_FILES_UNAVAILABLE_MESSAGE;
}
