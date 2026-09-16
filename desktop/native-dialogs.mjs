export const MAUTH_DOCUMENTS_FOLDER_CHOOSE_CHANNEL = "mauth:choose-documents-folder";
export const MAUTH_DOCUMENT_CHOOSE_CHANNEL = "mauth:choose-document";
export const MAUTH_DOCUMENT_SAVE_PATH_CHANNEL = "mauth:choose-document-save-path";
export const MAUTH_DOCUMENT_REVEAL_CHANNEL = "mauth:reveal-document";
export const MAUTH_DOCUMENT_REMEMBER_CHANNEL = "mauth:remember-document";

export async function chooseDocuments({ dialog, window = null }) {
  const options = {
    title: "Open Mauth document",
    filters: [{ name: "Mauth documents", extensions: ["mauth", "test.json"] }],
    properties: ["openFile", "multiSelections"],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

export async function chooseDocumentSavePath({ dialog, window = null, defaultPath }) {
  const options = {
    title: "Save Mauth document",
    defaultPath: typeof defaultPath === "string" ? defaultPath : "Untitled.mauth",
    filters: [{ name: "Mauth document", extensions: ["mauth"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  return result.canceled ? null : (result.filePath ?? null);
}

export async function chooseDocumentsFolder({ dialog, window = null }) {
  const options = {
    title: "Choose a Mauth documents folder",
    buttonLabel: "Open folder",
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const folderPath = result?.filePaths?.[0] ?? null;
  return {
    cancelled: Boolean(result?.canceled || !folderPath),
    path: folderPath,
  };
}
