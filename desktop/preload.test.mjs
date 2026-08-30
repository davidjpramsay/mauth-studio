import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadPreloadBridge() {
  const ipcListeners = new Map();
  const invocations = [];
  let exposedApi = null;
  const ipcRenderer = {
    invoke: async (channel) => {
      invocations.push(channel);
      return true;
    },
    on: (channel, listener) => ipcListeners.set(channel, listener),
  };
  const contextBridge = {
    exposeInMainWorld: (_name, api) => {
      exposedApi = api;
    },
  };

  vm.runInNewContext(fs.readFileSync(new URL("./preload.cjs", import.meta.url), "utf8"), {
    require: (moduleName) => {
      assert.equal(moduleName, "electron");
      return { contextBridge, ipcRenderer };
    },
  });

  return { api: exposedApi, ipcListeners, invocations };
}

test("preload bridges desktop close-tab commands and explicit window-close requests", async () => {
  const bridge = loadPreloadBridge();
  let closeRequests = 0;
  const unsubscribe = bridge.api.onCloseActiveDocument(() => {
    closeRequests += 1;
  });

  bridge.ipcListeners.get("mauth:close-active-document")({});
  assert.equal(closeRequests, 1);

  unsubscribe();
  bridge.ipcListeners.get("mauth:close-active-document")({});
  assert.equal(closeRequests, 1);

  assert.equal(await bridge.api.requestWindowClose(), true);
  assert.deepEqual(bridge.invocations, ["mauth:request-window-close"]);
});
