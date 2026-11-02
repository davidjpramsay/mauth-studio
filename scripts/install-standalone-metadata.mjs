import fs from "node:fs";
import path from "node:path";

export function migrateLegacyStandaloneMetadata({ legacyMetadata, standaloneMetadata, copy }) {
  if (!fs.existsSync(legacyMetadata)) return false;
  // External-folder users can have shared recovery state without workspace.json.
  // A populated state root belongs to the current installation and must not be merged.
  if (fs.existsSync(standaloneMetadata) && fs.readdirSync(standaloneMetadata).length > 0) return false;
  fs.mkdirSync(path.dirname(standaloneMetadata), { recursive: true });
  copy(legacyMetadata, standaloneMetadata);
  return true;
}
