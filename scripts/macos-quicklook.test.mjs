import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("macOS package registers the canonical document type and Quick Look bundles", () => {
  const config = parseYaml(fs.readFileSync(path.join(ROOT, "electron-builder.yml"), "utf8"));
  const association = config.mac.extendInfo.CFBundleDocumentTypes[0];
  assert.equal(association.CFBundleTypeIconFile, "mauth-document.icns");
  assert.equal(association.LSHandlerRank, "Owner");
  assert.deepEqual(association.LSItemContentTypes, ["au.edu.acc.mauth-studio.document"]);

  const declaration = config.mac.extendInfo.UTExportedTypeDeclarations[0];
  assert.equal(declaration.UTTypeIdentifier, "au.edu.acc.mauth-studio.document");
  assert.deepEqual(declaration.UTTypeTagSpecification["public.filename-extension"], ["mauth"]);
  assert.ok(config.extraFiles.some((item) => item.from === "tmp/macos/quicklook" && item.to === "PlugIns"));
  assert.ok(config.extraResources.some((item) => item.from === "build/mauth-document.icns" && item.to === "mauth-document.icns"));
  assert.ok(config.mac.signIgnore.some((pattern) => pattern.includes("Contents/PlugIns")));
});

test("Quick Look manifests support the exact exported document type", () => {
  const manifests = [
    ["Thumbnail", "com.apple.quicklook.thumbnail"],
    ["Preview", "com.apple.quicklook.preview"],
  ];

  for (const [folder, extensionPoint] of manifests) {
    const plist = fs.readFileSync(path.join(ROOT, "native", "MauthQuickLook", folder, "Info.plist"), "utf8");
    assert.match(plist, new RegExp(`<string>${extensionPoint.replaceAll(".", "\\.")}</string>`));
    assert.match(plist, /<string>au\.edu\.acc\.mauth-studio\.document<\/string>/);
    if (folder === "Preview") {
      assert.match(plist, /<key>QLSupportsSearchableItems<\/key>\s*<false\/>/);
      assert.match(plist, /<key>QLIsDataBasedPreview<\/key>\s*<false\/>/);
      assert.match(plist, /\$\(PRODUCT_MODULE_NAME\)\.PreviewViewController/);
    }
  }
});
