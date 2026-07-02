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
