import { defineConfig } from "@playwright/test";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const port =
  process.env.MAUTH_VISUAL_PORT ??
  (await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const portNumber = server.address().port;
      server.close(() => resolve(portNumber));
    });
  }));
process.env.MAUTH_VISUAL_PORT = String(port);

export default defineConfig({
  testDir: "./tests/visual",
  workers: 1,
  timeout: 60000,
  outputDir: path.join(os.tmpdir(), "mauth-visual-results"),
  snapshotPathTemplate: "{testDir}/baselines/{platform}/{arg}{ext}",
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.001 } },
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" },
  webServer: {
    command: `pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
