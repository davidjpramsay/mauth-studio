import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentTocItem } from "./documentNavigation.ts";

import {
  activePreviewAnchorForTocItem,
  clampEditorWorkspaceToolDockWidth,
  editorAppShellGridStyle,
  editorWorkspaceGridStyle,
  editorWorkspaceInspectorPresentation,
  editorWorkspaceResponsiveMode,
  editorWorkspaceVisibility,
} from "./editorWorkspacePresentation.ts";

test("editorWorkspaceVisibility keeps preview visible and gates the inspector on split mode", () => {
  assert.deepEqual(editorWorkspaceVisibility("preview", true), {
    showEditor: false,
    showPreview: true,
    showInspectorPane: false,
  });
  assert.deepEqual(editorWorkspaceVisibility("split", true), {
    showEditor: true,
    showPreview: true,
    showInspectorPane: true,
  });
});

test("editorWorkspaceGridStyle preserves preview, split, and inspector layouts", () => {
  assert.equal(editorWorkspaceGridStyle("preview", false).gridTemplateColumns, "minmax(0, 1fr)");
  assert.equal(editorWorkspaceGridStyle("split", false).gridTemplateColumns, "minmax(0, 1fr) minmax(0, 1fr)");
  assert.match(editorWorkspaceGridStyle("split", true).gridTemplateColumns, /21rem/);
});

test("editorWorkspaceInspectorPresentation opens the pane before a block is selected", () => {
  assert.deepEqual(editorWorkspaceInspectorPresentation(true, false), {
    showPane: true,
    showSelection: false,
  });
  assert.deepEqual(editorWorkspaceInspectorPresentation(true, true), {
    showPane: true,
    showSelection: true,
  });
  assert.deepEqual(editorWorkspaceInspectorPresentation(false, true), {
    showPane: false,
    showSelection: false,
  });
});

test("editorWorkspaceResponsiveMode protects compact workspaces from three narrow panes", () => {
  assert.equal(editorWorkspaceResponsiveMode(700), "overlay");
  assert.equal(editorWorkspaceResponsiveMode(839), "overlay");
  assert.equal(editorWorkspaceResponsiveMode(840), "compact");
  assert.equal(editorWorkspaceResponsiveMode(1239), "compact");
  assert.equal(editorWorkspaceResponsiveMode(1240), "wide");
});

test("clampEditorWorkspaceToolDockWidth preserves readable tools and preview", () => {
  assert.equal(clampEditorWorkspaceToolDockWidth(100, 1180), 384);
  assert.equal(clampEditorWorkspaceToolDockWidth(460, 1180), 460);
  assert.equal(clampEditorWorkspaceToolDockWidth(800, 1180), 520);
  assert.equal(clampEditorWorkspaceToolDockWidth(520, 840), 480);
});

test("editorAppShellGridStyle reserves the expanded document navigator column", () => {
  assert.equal(editorAppShellGridStyle(false).gridTemplateColumns, "3.25rem minmax(0, 1fr)");
  assert.match(editorAppShellGridStyle(true).gridTemplateColumns, /18rem/);
});

test("activePreviewAnchorForTocItem suppresses page-break anchors and maps normal items", () => {
  const items = [{ id: "q:q1", editorAnchor: "q:q1", previewAnchor: "preview:q1" }] as DocumentTocItem[];
  const mapper = (anchor: string, currentItems: DocumentTocItem[]) =>
    currentItems.find((item) => item.editorAnchor === anchor)?.previewAnchor;

  assert.equal(activePreviewAnchorForTocItem("pb:q1", items, mapper), undefined);
  assert.equal(activePreviewAnchorForTocItem("q:q1", items, mapper), "preview:q1");
});
