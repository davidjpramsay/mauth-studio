import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.MAUTH_AGENT_TOKEN?.trim() && process.env.MAUTH_UNSAFE_ALLOW_UNAUTHENTICATED !== "1") {
  console.error("Mauth requires an API token. Use pnpm desktop:dev for the authenticated editor.");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(
  "uv",
  [
    "run",
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
    "8000",
  ],
  { cwd: path.join(root, "apps", "api"), env: process.env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
