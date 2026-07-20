#!/usr/bin/env node
import { stdin, stdout, stderr } from "node:process";

import { renderGeometricConstructionDiagram } from "./index.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  try {
    const input = JSON.parse(await readStdin());
    const output = await renderGeometricConstructionDiagram(input);
    stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
