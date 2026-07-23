import path from "node:path";

export function developmentRuntimePlan({ repoRoot, apiPort, webPort }) {
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  return {
    apiUrl,
    webUrl,
    api: {
      cwd: path.join(repoRoot, "apps", "api"),
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
      executable: path.join(repoRoot, "apps", "web", "node_modules", ".bin", "vite"),
      args: ["--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
      env: {
        VITE_API_URL: "",
        VITE_API_PROXY_TARGET: apiUrl,
      },
    },
  };
}
