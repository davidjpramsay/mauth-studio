export function listenerAddressSet(listeners) {
  return new Set(listeners.flatMap((listener) => listener.names ?? []));
}

export function listenersAreAmbiguous(listeners) {
  return listeners.length > 1 && listenerAddressSet(listeners).size > 1;
}

export function hasMauthOwnedListener(listeners) {
  return listeners.some((listener) => listener.isMauthOwned);
}

export function desktopReplacementReasons({ apiHealthy, webHealthy, apiListeners, webListeners }) {
  const apiHasMauthListener = hasMauthOwnedListener(apiListeners);
  const webHasMauthListener = hasMauthOwnedListener(webListeners);
  const reasons = [];

  if (apiHasMauthListener && !apiHealthy) {
    reasons.push("Mauth API listener is stale or unhealthy.");
  }
  if (webHasMauthListener && !webHealthy) {
    reasons.push("Mauth web listener is stale or unreachable.");
  }
  if (webHasMauthListener && !apiHealthy) {
    reasons.push("Mauth web is running without a healthy API.");
  }

  return [...new Set(reasons)];
}

export function shouldReplaceDesktopListeners(state) {
  return desktopReplacementReasons(state).length > 0;
}

export function runtimeStatusSummary({ apiHealthy, webHealthy, apiListeners, webListeners, webUrl }) {
  const apiHasMauthListener = hasMauthOwnedListener(apiListeners);
  const webHasMauthListener = hasMauthOwnedListener(webListeners);
  const hasAnyListener = apiListeners.length > 0 || webListeners.length > 0;

  if (apiHealthy && webHealthy) {
    return {
      level: "ok",
      message: `Mauth is ready${webUrl ? ` at ${webUrl}` : ""}.`,
      detail: "Use the open browser tab. Stop with pnpm dev:stop, the launcher Terminal Ctrl+C, or Mauth Studio Stop.command.",
    };
  }

  if (!apiHealthy && !webHealthy && !hasAnyListener) {
    return {
      level: "info",
      message: "Mauth is stopped.",
      detail: "Start it with pnpm dev:launch:desktop, or double-click ~/Applications/Mauth Studio.app.",
    };
  }

  if (apiHasMauthListener || webHasMauthListener) {
    return {
      level: "warn",
      message: "Mauth is partially running or stale.",
      detail: "Run pnpm dev:launch:desktop to repair it, or pnpm dev:stop to stop Mauth-owned listeners.",
    };
  }

  return {
    level: "warn",
    message: "Mauth is not ready and the configured ports are occupied by non-Mauth processes.",
    detail: "Stop the conflicting processes, or set MAUTH_AGENT_API_URL and MAUTH_WEB_URL to free ports.",
  };
}
