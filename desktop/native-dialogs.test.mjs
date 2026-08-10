import assert from "node:assert/strict";
import test from "node:test";

import { chooseDocumentsFolder } from "./native-dialogs.mjs";

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
