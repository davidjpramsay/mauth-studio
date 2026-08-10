import {
  normalizeInvestigation,
  withInvestigationLegacyMirrors,
  type InvestigationConfig,
  type InvestigationStudentPageConfig,
} from "./frontMatterConfig.ts";
import type { EditorContentBlock } from "./editorDocumentNormalization.ts";
import type { SelectedEditorBlock } from "./editorBlockSelection.ts";
import {
  investigationPageIdFromScrollAnchor,
  investigationPageScrollAnchor,
  investigationTextSectionScrollAnchor,
  parseScrollAnchor,
} from "./scrollAnchors.ts";

export interface InvestigationStructureChange {
  investigation: InvestigationConfig;
  anchor: string;
}

export function selectedInvestigationDiagramFromAnchor(value: InvestigationConfig | unknown, anchor: string): SelectedEditorBlock | null {
  const parsed = parseScrollAnchor(anchor);
  if (parsed.kind !== "investigationDiagram" || !parsed.investigationPageId || !parsed.investigationDiagramId) return null;

  const investigation = normalizeInvestigation(value);
  const diagramIndex = investigation.diagrams.findIndex(
    (diagram) => diagram.id === parsed.investigationDiagramId && diagram.pageId === parsed.investigationPageId,
  );
  const diagram = diagramIndex >= 0 ? investigation.diagrams[diagramIndex] : null;
  if (!diagram) return null;

  return {
    scope: { kind: "investigationDiagram", pageId: diagram.pageId, diagramId: diagram.id },
    block: {
      id: diagram.id,
      kind: "diagram",
      graphConfig: diagram.graphConfig,
      diagramAlign: diagram.alignment,
    },
    label: diagram.title.trim() || `Investigation diagram ${diagramIndex + 1}`,
    summary: diagram.graphConfig.type === "graph2d" ? "2D graph" : "Diagram settings",
  };
}

export function updateInvestigationDiagramFromInspector(
  value: InvestigationConfig | unknown,
  selection: SelectedEditorBlock,
  patch: Partial<EditorContentBlock>,
): InvestigationConfig {
  const investigation = normalizeInvestigation(value);
  if (selection.scope.kind !== "investigationDiagram") return investigation;
  const { diagramId, pageId } = selection.scope;

  return withInvestigationLegacyMirrors({
    ...investigation,
    diagrams: investigation.diagrams.map((diagram) => {
      if (diagram.id !== diagramId || diagram.pageId !== pageId) return diagram;
      return {
        ...diagram,
        ...(patch.kind === "diagram" || "graphConfig" in patch ? { graphConfig: patch.graphConfig ?? diagram.graphConfig } : {}),
        ...("diagramAlign" in patch ? { alignment: patch.diagramAlign ?? diagram.alignment } : {}),
      };
    }),
  });
}

export function addInvestigationStudentPage(
  value: InvestigationConfig | unknown,
  createId: (prefix: string) => string,
): InvestigationStructureChange {
  const investigation = normalizeInvestigation(value);
  const pageNumber = investigation.studentPages.length + 1;
  const pageId = createId("investigation-page");
  const sectionId = createId("investigation-text");
  const page: InvestigationStudentPageConfig = {
    id: pageId,
    title:
      pageNumber === 2 ? `${investigation.studentPages[0]?.title || investigation.taskTitle} (continued)` : `Student page ${pageNumber}`,
    sections: [{ id: sectionId, heading: "New text section", body: "" }],
  };
  return {
    investigation: withInvestigationLegacyMirrors({
      ...investigation,
      studentPages: [...investigation.studentPages, page],
    }),
    anchor: investigationPageScrollAnchor(pageId),
  };
}

export function addInvestigationTextSection(
  value: InvestigationConfig | unknown,
  activeAnchor: string,
  createId: (prefix: string) => string,
): InvestigationStructureChange {
  const investigation = normalizeInvestigation(value);
  const selectedPageId = investigationPageIdFromScrollAnchor(activeAnchor);
  const page = investigation.studentPages.find((entry) => entry.id === selectedPageId) ?? investigation.studentPages.at(-1);
  if (!page) return addInvestigationStudentPage(investigation, createId);

  const sectionId = createId("investigation-text");
  return {
    investigation: withInvestigationLegacyMirrors({
      ...investigation,
      studentPages: investigation.studentPages.map((entry) =>
        entry.id === page.id
          ? {
              ...entry,
              sections: [...entry.sections, { id: sectionId, heading: "New text section", body: "" }],
            }
          : entry,
      ),
    }),
    anchor: investigationTextSectionScrollAnchor(page.id, sectionId),
  };
}
