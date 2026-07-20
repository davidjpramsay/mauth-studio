import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaultOutputDir = "/Users/djpramsay@acc.edu.au/Desktop/Year 10 Exam Canvas Prep";
const outputDir = process.argv[2] ?? defaultOutputDir;
const manifestPath = path.join(outputDir, "canvas-question-manifest.json");
const reportPath = path.join(outputDir, "canvas-question-audit-report.json");

const forbiddenText = [
  "AUSTRALIAN CHRISTIAN COLLEGE",
  "Worksheet",
  "Canvas Q",
  "Canvas Source",
  "Y10 Units 1-4 Exam S1",
  "Y10 Units 1-4 Exam S2",
];

function fail(message, details = {}) {
  return { ok: false, message, ...details };
}

async function commandOutput(command, args) {
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function assertQuestionEntry(entry, index) {
  const problems = [];
  if (!entry || typeof entry !== "object") problems.push(fail("Manifest entry is not an object", { index }));
  if (typeof entry.section !== "string") problems.push(fail("Manifest entry is missing section", { index, entry }));
  if (!Number.isInteger(entry.question)) problems.push(fail("Manifest entry is missing numeric question", { index, entry }));
  if (!Number.isInteger(entry.marks)) problems.push(fail("Manifest entry is missing numeric marks", { index, entry }));
  if (typeof entry.pdf !== "string") problems.push(fail("Manifest entry is missing pdf path", { index, entry }));
  if (typeof entry.png !== "string") problems.push(fail("Manifest entry is missing png path", { index, entry }));
  return problems;
}

async function assertPng(entry) {
  const problems = [];
  let pdfStat = null;
  let pngStat = null;
  try {
    pdfStat = await fs.stat(entry.pdf);
  } catch {
    problems.push(fail("PDF file is missing", { entry }));
  }
  try {
    pngStat = await fs.stat(entry.png);
  } catch {
    problems.push(fail("PNG file is missing", { entry }));
  }
  if (!pngStat) return problems;
  if (pngStat.size <= 0) problems.push(fail("PNG file is empty", { png: entry.png }));
  if (pdfStat && pngStat.mtimeMs + 1000 < pdfStat.mtimeMs) {
    problems.push(fail("PNG appears older than its PDF; regenerate PNG after splitting/exporting", { pdf: entry.pdf, png: entry.png }));
  }
  const handle = await fs.open(entry.png, "r");
  try {
    const signature = Buffer.alloc(8);
    await handle.read(signature, 0, 8, 0);
    if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      problems.push(fail("PNG file does not have a PNG signature", { png: entry.png }));
    }
  } finally {
    await handle.close();
  }
  return problems;
}

async function assertPdf(entry) {
  const problems = [];
  const expectedName = new RegExp(`${entry.section}-Q${String(entry.question).padStart(2, "0")}-${entry.marks}marks\\.pdf$`);
  if (!expectedName.test(entry.pdf)) {
    problems.push(fail("PDF filename does not match section, question, and marks", { entry, expectedPattern: String(expectedName) }));
  }
  const expectedPng = new RegExp(`${entry.section}-Q${String(entry.question).padStart(2, "0")}-${entry.marks}marks\\.png$`);
  if (!expectedPng.test(entry.png)) {
    problems.push(fail("PNG filename does not match section, question, and marks", { entry, expectedPattern: String(expectedPng) }));
  }

  let info = "";
  try {
    info = await commandOutput("pdfinfo", [entry.pdf]);
  } catch (error) {
    problems.push(fail("Could not run pdfinfo on PDF", { pdf: entry.pdf, error: String(error.message ?? error) }));
    return problems;
  }
  const pageMatch = info.match(/^Pages:\s+(\d+)$/m);
  const pages = pageMatch ? Number(pageMatch[1]) : null;
  if (pages !== 1) problems.push(fail("Canvas question PDF must be exactly one page", { pdf: entry.pdf, pages }));

  let text = "";
  try {
    text = await commandOutput("pdftotext", [entry.pdf, "-"]);
  } catch (error) {
    problems.push(fail("Could not run pdftotext on PDF", { pdf: entry.pdf, error: String(error.message ?? error) }));
    return problems;
  }
  const questionLabels = [...text.matchAll(/Question\s+(\d+)/g)].map((match) => Number(match[1]));
  if (questionLabels.length !== 1 || questionLabels[0] !== entry.question) {
    problems.push(fail("PDF question label mismatch", { pdf: entry.pdf, expectedQuestion: entry.question, questionLabels }));
  }
  for (const term of forbiddenText) {
    if (text.includes(term)) problems.push(fail("PDF contains stale worksheet/export text", { pdf: entry.pdf, term }));
  }
  return problems;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const questionEntries = manifest.filter((entry) => Number.isInteger(entry.question));
  const problems = [];
  if (questionEntries.length === 0) {
    problems.push(fail("Manifest has no question entries", { manifestPath }));
  }

  const seen = new Set();
  for (const [index, entry] of questionEntries.entries()) {
    problems.push(...assertQuestionEntry(entry, index));
    const key = `${entry.section}:${entry.question}`;
    if (seen.has(key)) problems.push(fail("Duplicate section/question entry", { key, entry }));
    seen.add(key);
    if (typeof entry.pdf === "string") problems.push(...(await assertPdf(entry)));
    if (typeof entry.png === "string") problems.push(...(await assertPng(entry)));
  }

  const report = {
    ok: problems.length === 0,
    outputDir,
    manifestPath,
    checkedQuestions: questionEntries.length,
    problems,
    checkedAt: new Date().toISOString(),
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
