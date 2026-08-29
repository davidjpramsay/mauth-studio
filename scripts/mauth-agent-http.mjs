import { agentAuthorizationHeaders, resolveMauthRuntime } from "./mauth-runtime.mjs";

function parseResponseBody(value) {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function asStructuredBody(status, body, extra = {}) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { httpStatus: status, ...extra, ...body };
  }
  return { httpStatus: status, ...extra, body };
}

function runtimeIdentity(runtime) {
  return `${runtime.apiUrl}\n${runtime.agentToken || ""}`;
}

export function createMauthBridgeRequest({ fetchImpl = fetch, resolveRuntime = resolveMauthRuntime } = {}) {
  async function requestOnce(runtime, path, { method, body, headers }) {
    const response = await fetchImpl(`${runtime.apiUrl}${path}`, {
      method,
      headers: body
        ? { "Content-Type": "application/json", ...agentAuthorizationHeaders(runtime), ...headers }
        : { ...agentAuthorizationHeaders(runtime), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return asStructuredBody(response.status, parseResponseBody(await response.text()));
  }

  return async function bridgeRequest(path, { method = "GET", body, headers = {} } = {}) {
    const initialRuntime = resolveRuntime();
    try {
      const response = await requestOnce(initialRuntime, path, { method, body, headers });
      if (![401, 403].includes(response.httpStatus)) return response;

      const refreshedRuntime = resolveRuntime();
      if (runtimeIdentity(refreshedRuntime) === runtimeIdentity(initialRuntime)) return response;
      return await requestOnce(refreshedRuntime, path, { method, body, headers });
    } catch (initialError) {
      const refreshedRuntime = resolveRuntime();
      if (runtimeIdentity(refreshedRuntime) !== runtimeIdentity(initialRuntime)) {
        try {
          return await requestOnce(refreshedRuntime, path, { method, body, headers });
        } catch {
          // Report the normal local-app connection error below.
        }
      }
      return {
        httpStatus: 0,
        success: false,
        code: "APP_NOT_CONNECTED",
        error: initialError instanceof Error ? initialError.message : "Could not reach the Mauth API bridge.",
        setupLink: "/agent-docs",
      };
    }
  };
}
