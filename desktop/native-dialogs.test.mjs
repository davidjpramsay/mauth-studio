import assert from "node:assert/strict";
import test from "node:test";

import { chooseDocumentsFolder, chooseDocuments, chooseDocumentSavePath } from "./native-dialogs.mjs";

test("native folder selection returns one directory path", async () => {
  const window = { id: "main" };
  let receivedWindow = null;
  let receivedOptions = null;
  const result = await chooseDocumentsFolder({
    window,
    dialog: {
      async showOpenDialog(nextWindow, options) {
        receivedWindow = nextWindow;
        receivedOptions = options;
        return { canceled: false, filePaths: ["/Documents/Assessments"] };
      },
    },
  });

  assert.equal(receivedWindow, window);
  assert.ok(receivedOptions.properties.includes("openDirectory"));
  assert.equal(result.cancelled, false);
  assert.equal(result.path, "/Documents/Assessments");
});

test("Open permits multiple Mauth documents and cancellation returns no paths", async () => {
  const paths = ["/one/a.mauth", "/two/b.mauth"];
  assert.deepEqual(
    await chooseDocuments({
      dialog: {
        showOpenDialog: async (options) => {
          assert.deepEqual(options.properties, ["openFile", "multiSelections"]);
          assert.deepEqual(options.filters[0].extensions, ["mauth", "test.json"]);
          return { canceled: false, filePaths: paths };
        },
      },
    }),
    paths,
  );
  assert.deepEqual(await chooseDocuments({ dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: paths }) } }), []);
});

test("Save As returns only the confirmed destination and requests overwrite confirmation", async () => {
  const dialog = {
    showSaveDialog: async (options) => {
      assert.equal(options.defaultPath, "/two/Assessment.mauth");
      assert.ok(options.properties.includes("showOverwriteConfirmation"));
      return { canceled: false, filePath: "/two/Copy.mauth" };
    },
  };
  assert.equal(await chooseDocumentSavePath({ dialog, defaultPath: "/two/Assessment.mauth" }), "/two/Copy.mauth");
  assert.equal(
    await chooseDocumentSavePath({ dialog: { showSaveDialog: async () => ({ canceled: true, filePath: "/two/Copy.mauth" }) } }),
    null,
  );
});

test("native folder selection reports cancellation without inventing a path", async () => {
  const result = await chooseDocumentsFolder({
    dialog: {
      async showOpenDialog(options) {
        assert.ok(options.properties.includes("openDirectory"));
        return { canceled: true, filePaths: [] };
      },
    },
  });

  assert.deepEqual(result, { cancelled: true, path: null });
});
