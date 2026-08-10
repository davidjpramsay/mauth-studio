import assert from "node:assert/strict";
import test from "node:test";

import {
  addInvestigationStudentPage,
  addInvestigationTextSection,
  selectedInvestigationDiagramFromAnchor,
  updateInvestigationDiagramFromInspector,
} from "./investigationDocument.ts";

function createId(prefix: string) {
  return `${prefix}-new`;
}

test("addInvestigationStudentPage creates a structured page and legacy-compatible mirror", () => {
  const change = addInvestigationStudentPage(
    {
      taskTitle: "Flight paths",
      taskBody: "Meet Pilot Poole.",
      taskBodyContinuation: "",
      diagrams: [],
    },
    createId,
  );

  assert.equal(change.anchor, "ip:investigation-page-new");
  assert.equal(change.investigation.studentPages.length, 2);
  assert.equal(change.investigation.studentPages[1]?.sections[0]?.id, "investigation-text-new");
  assert.match(change.investigation.taskBodyContinuation, /New text section/);
});

test("addInvestigationTextSection targets the selected page", () => {
  const change = addInvestigationTextSection(
    {
      studentPages: [
        { id: "page-1", title: "Story", sections: [] },
        { id: "page-2", title: "Models", sections: [] },
      ],
    },
    "ip:page-1",
    createId,
  );

  assert.equal(change.anchor, "ip:page-1/it:investigation-text-new");
  assert.equal(change.investigation.studentPages[0]?.sections.length, 1);
  assert.equal(change.investigation.studentPages[1]?.sections.length, 0);
});

test("investigation diagrams participate in shared module selection and inspector updates", () => {
  const investigation = {
    studentPages: [{ id: "page-1", title: "Task", sections: [] }],
    diagrams: [
      {
        id: "diagram-1",
        title: "Tangent geometry",
        caption: "",
        pageId: "page-1",
        page: 1 as const,
        alignment: "center" as const,
        graphConfig: { type: "graph2d", xMin: -5, xMax: 5, yMin: -5, yMax: 5 },
      },
    ],
  };
  const selection = selectedInvestigationDiagramFromAnchor(investigation, "ip:page-1/id:diagram-1/gf:0");

  assert.ok(selection);
  assert.equal(selection.scope.kind, "investigationDiagram");
  assert.equal(selection.block.kind, "diagram");

  const updated = updateInvestigationDiagramFromInspector(investigation, selection, {
    graphConfig: { ...selection.block.graphConfig, equalScale: true },
    diagramAlign: "right",
  });
  assert.equal(updated.diagrams[0]?.graphConfig.equalScale, true);
  assert.equal(updated.diagrams[0]?.alignment, "right");
});
