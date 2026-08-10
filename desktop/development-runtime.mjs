import path from "node:path";

import { developmentPythonExecutable } from "./platform-paths.mjs";

export function developmentRuntimePlan({ repoRoot, apiPort, webPort, platform = process.platform, nodeExecutable = process.execPath }) {
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  return {
    apiUrl,
    webUrl,
    api: {
      cwd: path.join(repoRoot, "apps", "api"),
      executable: developmentPythonExecutable(repoRoot, platform),
      args: [
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--reload-dir",
        "app",
        "--reload-dir",
        "../../packages",
        "--reload-dir",
        "../../configs",
        "--host",
        "127.0.0.1",
        "--port",
        String(apiPort),
      ],
    },
    web: {
      cwd: path.join(repoRoot, "apps", "web"),
      executable: nodeExecutable,
      args: [
        path.join(repoRoot, "apps", "web", "node_modules", "vite", "bin", "vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        VITE_API_URL: "",
        VITE_API_PROXY_TARGET: apiUrl,
      },
    },
  };
}
