import path from "node:path";

export const MAUTH_DOCUMENT_OPEN_CHANNEL = "mauth:open-document";

export function isMauthDocumentPath(filePath) {
  const lowerPath = String(filePath ?? "").toLowerCase();
  return lowerPath.endsWith(".mauth") || lowerPath.endsWith(".test.json");
}

export function mauthDocumentPathsFromCommandLine(commandLine) {
  return [...new Set(commandLine.filter(isMauthDocumentPath).map((filePath) => path.resolve(filePath)))];
}
