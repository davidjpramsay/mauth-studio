export const MAUTH_DOCUMENTS_FOLDER_CHOOSE_CHANNEL = "mauth:choose-documents-folder";

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
