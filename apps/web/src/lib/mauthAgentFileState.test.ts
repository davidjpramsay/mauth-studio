import assert from "node:assert/strict";
import test from "node:test";

import type { MauthDocumentFlowItem, MauthQuestionLike, MauthSectionHeadingLike } from "./mauthActions.ts";
import { buildMauthAgentFileState, buildMauthAgentFileStateForDocument } from "./mauthAgentFileState.ts";

test("buildMauthAgentFileState reports unsaved drafts without project file identity", () => {
  const state = buildMauthAgentFileState({
    documentFingerprint: "draft-fingerprint",
    lastProjectSaveFingerprint: null,
    autosaveStatus: "saved",
    autosaveMessage: "Autosaved draft",
  });

  assert.equal(state.activePath, undefined);
  assert.equal(state.dirty, false);
  assert.equal(state.saveStatus, "draft");
  assert.equal(state.autosaveStatus, "saved");
});

test("buildMauthAgentFileState distinguishes saved and dirty project files", () => {
  const savedState = buildMauthAgentFileState({
    projectId: "local-project",
    projectName: "Documents",
    activePath: "Tests/demo.test.json",
    activeRevision: 4,
    documentFingerprint: "same",
    lastProjectSaveFingerprint: "same",
  });
  const dirtyState = buildMauthAgentFileState({
    projectId: "local-project",
    projectName: "Documents",
    activePath: "Tests/demo.test.json",
    activeRevision: 4,
    documentFingerprint: "changed",
    lastProjectSaveFingerprint: "same",
  });

  assert.equal(savedState.dirty, false);
  assert.equal(savedState.saveStatus, "saved");
  assert.equal(dirtyState.dirty, true);
  assert.equal(dirtyState.saveStatus, "dirty");
});

test("buildMauthAgentFileState prioritizes loading and revision conflicts", () => {
  assert.equal(
    buildMauthAgentFileState({
      activePath: "Tests/demo.test.json",
      documentFingerprint: "changed",
      lastProjectSaveFingerprint: "same",
      fileOperationBusy: true,
      hasRevisionIssue: true,
    }).saveStatus,
    "loading",
  );
  assert.equal(
    buildMauthAgentFileState({
      activePath: "Tests/demo.test.json",
      documentFingerprint: "same",
      lastProjectSaveFingerprint: "same",
      hasRevisionIssue: true,
    }).saveStatus,
    "conflict",
  );
});

test("buildMauthAgentFileStateForDocument normalizes document state before fingerprinting", () => {
  const question = { id: "q1", marks: 0, contentBlocks: [] } satisfies MauthQuestionLike;
  const headings = [{ id: "h1", title: "Section A" }] satisfies MauthSectionHeadingLike[];
  const flow = [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
  ] satisfies MauthDocumentFlowItem[];
  const logo = { id: "logo-1" };
  const captured: Record<string, unknown> = {};

  const state = buildMauthAgentFileStateForDocument({
    activeProject: { id: "local-project", name: "Documents" },
    activePath: "Tests/demo.test.json",
    activeRevision: 4,
    document: {
      frontMatter: { logoId: "logo-1" },
      questions: [question],
      sectionHeadings: [
        { id: "h1", title: "Section A" },
        { id: "stale", title: "Stale" },
      ],
      documentFlow: [...flow, { kind: "question", id: "missing" }],
      formattingConfig: { id: "raw" },
    },
    logos: [logo],
    lastProjectSaveFingerprint: "normalized-fingerprint",
    autosaveStatus: "saved",
    autosaveMessage: "Autosaved",
    normalizeFormattingConfig: (value) => ({ id: `normalized:${(value as { id?: string } | undefined)?.id ?? "default"}` }),
    normalizeSectionHeadings: () => headings,
    normalizeDocumentFlow: (_value, questions, sectionHeadings) => {
      assert.deepEqual(questions, [question]);
      assert.deepEqual(sectionHeadings, headings);
      return flow;
    },
    selectedLogoForFrontMatter: (logos, frontMatter) => {
      captured.selectedLogoFrontMatter = frontMatter;
      return logos.find((current) => current.id === frontMatter.logoId);
    },
    editorDocumentFingerprint: (frontMatter, questions, formattingConfig, selectedLogo, sectionHeadings, documentFlow) => {
      captured.frontMatter = frontMatter;
      captured.questions = questions;
      captured.formattingConfig = formattingConfig;
      captured.selectedLogo = selectedLogo;
      captured.sectionHeadings = sectionHeadings;
      captured.documentFlow = documentFlow;
      return "normalized-fingerprint";
    },
  });

  assert.equal(state.saveStatus, "saved");
  assert.equal(state.dirty, false);
  assert.equal(state.projectId, "local-project");
  assert.deepEqual(captured.formattingConfig, { id: "normalized:raw" });
  assert.deepEqual(captured.selectedLogo, logo);
  assert.deepEqual(captured.sectionHeadings, headings);
  assert.deepEqual(captured.documentFlow, flow);
});
