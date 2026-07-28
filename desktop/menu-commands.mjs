export const MAUTH_SYSTEM_STATUS_OPEN_CHANNEL = "mauth:open-system-status";
export const MAUTH_THEME_TOGGLE_CHANNEL = "mauth:toggle-theme";
export const MAUTH_SOLUTION_VALIDATION_OPEN_CHANNEL = "mauth:open-solution-validation";

export function sendDesktopMenuCommand(browserWindow, channel) {
  if (!browserWindow || browserWindow.isDestroyed?.() || browserWindow.webContents?.isDestroyed?.()) return false;
  browserWindow.webContents.send(channel);
  return true;
}
