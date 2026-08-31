import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  desktopRuntimeManifestPath,
  desktopUserDataDirectory,
  developmentPythonExecutable,
  packagedAgentConnectorFileName,
  packagedSidecarExecutable,
} from "./platform-paths.mjs";

test("desktop state follows each operating system's conventional application-data folder", () => {
  assert.equal(
    desktopUserDataDirectory({ platform: "darwin", homeDirectory: "/Users/teacher" }),
    path.join("/Users/teacher", "Library", "Application Support", "Mauth Studio"),
  );
  assert.equal(
    desktopUserDataDirectory({
      platform: "win32",
      homeDirectory: "C:\\Users\\teacher",
      env: { APPDATA: "C:\\Users\\teacher\\AppData\\Roaming" },
    }),
    path.join("C:\\Users\\teacher\\AppData\\Roaming", "Mauth Studio"),
  );
  assert.equal(
    desktopUserDataDirectory({
      platform: "linux",
      homeDirectory: "/home/teacher",
      env: { XDG_CONFIG_HOME: "/home/teacher/.local/config" },
    }),
    path.join("/home/teacher/.local/config", "Mauth Studio"),
  );
  assert.equal(
    desktopRuntimeManifestPath({ platform: "linux", homeDirectory: "/home/teacher" }),
    path.join("/home/teacher", ".config", "Mauth Studio", "runtime.json"),
  );
});

test("development and packaged executable names follow the target platform", () => {
  assert.equal(developmentPythonExecutable("/repo", "darwin"), path.join("/repo", "apps", "api", ".venv", "bin", "python"));
  assert.equal(developmentPythonExecutable("C:\\repo", "win32"), path.join("C:\\repo", "apps", "api", ".venv", "Scripts", "python.exe"));
  assert.equal(packagedSidecarExecutable("/resources", "linux"), path.join("/resources", "sidecars", "mauth-api", "mauth-api"));
  assert.equal(packagedSidecarExecutable("C:\\resources", "win32"), path.join("C:\\resources", "sidecars", "mauth-api", "mauth-api.exe"));
  assert.equal(packagedAgentConnectorFileName("darwin"), "mauth-agent-mcp");
  assert.equal(packagedAgentConnectorFileName("win32"), "mauth-agent-mcp.cmd");
});
