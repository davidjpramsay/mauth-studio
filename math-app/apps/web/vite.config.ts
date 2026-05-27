import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const KNOWN_LARGE_CHUNK_LIMIT_KB = 5000;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@mauth-studio/diagram-plotly": path.resolve(__dirname, "../../packages/diagram-plotly/src/index.ts"),
      "@mauth-studio/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Plotly is intentionally lazy-loaded by StatsChartDiagram, but the generated
    // dependency chunk is larger than Vite's generic 500 KB browser-app default.
    chunkSizeWarningLimit: KNOWN_LARGE_CHUNK_LIMIT_KB,
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        const isJsxGraphEvalWarning = level === "warn" && log.code === "EVAL" && Boolean(log.id?.includes("/jsxgraph/"));
        if (isJsxGraphEvalWarning) return;
        defaultHandler(level, log);
      },
      output: {
        codeSplitting: {
          groups: [
            { name: "plotly", test: /node_modules[\\/]plotly\.js-dist-min[\\/]/ },
            { name: "jsxgraph", test: /node_modules[\\/]jsxgraph[\\/]/ },
            {
              name: "math-rendering",
              test: /node_modules[\\/](mathjax-full|speech-rule-engine|wicked-good-xpath|@babel[\\/]runtime)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
