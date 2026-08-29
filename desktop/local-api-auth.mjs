export function isRuntimeApiRequest(requestUrl, origins) {
  try {
    const parsed = new URL(requestUrl);
    return parsed.pathname.startsWith("/api/") && origins.has(parsed.origin);
  } catch {
    return false;
  }
}
