import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBlock, GraphConfig } from "@mauth-studio/shared";

import { DEFAULT_3D_VIEW_STATE } from "../../lib/diagram3d.ts";
import { DEFAULT_NETWORK_DATA } from "../../lib/diagramNetwork.ts";
import { DEFAULT_VECTOR_2D_GRAPH } from "../../lib/diagramVector2d.ts";
import { applyMauthAction, type MauthQuestionLike } from "../../lib/mauthActions.ts";
import {
  columnsColumnCountPatch,
  contentBlockDisplayVisibility,
  contentBlockMarkTicksPatch,
  contentBlockSolutionTickHelp,
  contentBlockSolutionTickLabel,
  contentBlockSupportsSolutionSurfaceTicks,
  contentBlockVisibilityPatch,
  graph3dResetViewPatch,
  graph3dViewPatch,
  graphInspectorWidthPatch,
  imageDataPatch,
  imageSizePatch,
  inspectorSpaceLines,
  networkPresetPatch,
  networkVisibilityPatch,
  penroseResamplePatch,
  penroseScalePatch,
  setDiagramCountLabelsPatch,
  setDiagramNotationPatch,
  setDiagramSetCountPatch,
  setDiagramShadingPatch,
  tableColumnCountPatch,
  tableRowsCountPatch,
  vector2dLabelStylePatch,
} from "../../lib/moduleSettingsPatches.ts";

function textBlock(id: string): ContentBlock {
  return { id, kind: "text", text: "" };
}

function spaceBlock(id: string, lines: number): ContentBlock {
  return { id, kind: "space", lines };
}

function tableBlock(id: string): Extract<ContentBlock, { kind: "table" }> {
  return {
    id,
    kind: "table",
    headers: ["A", "B"],
    rows: [
      ["1", "2"],
      ["3", "4"],
    ],
    showHeader: true,
    tableAlign: "center",
    cellAlignment: "center",
  };
}

function diagramBlock(id: string, graphConfig: GraphConfig): ContentBlock {
  return { id, kind: "diagram", graphConfig };
}

function question(id: string, blocks: ContentBlock[]): MauthQuestionLike {
  return {
    id,
    marks: 0,
    contentBlocks: blocks,
    itemOrder: blocks.map((block) => ({ kind: "block", id: block.id })),
    parts: [],
    pageBreakAfter: false,
  };
}

function findContentBlock(blocks: readonly ContentBlock[], blockId: string): ContentBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.kind === "columns") {
      for (const column of block.columns) {
        const nested = findContentBlock(column, blockId);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function updateQuestionModule(
  questions: MauthQuestionLike[],
  blockId: string,
  patch: Partial<ContentBlock> | { graphConfig: GraphConfig },
): MauthQuestionLike[] {
  const result = applyMauthAction(questions, {
    type: "module.update",
    scope: { kind: "question", questionId: "q1" },
    blockId,
    patch,
  });
  assert.equal(result.ok, true, result.error);
  return result.questions;
}

function penroseConfig(overrides: Partial<GraphConfig> = {}): GraphConfig {
  return {
    type: "geometricConstruction",
    data: {},
    options: { scalePercent: 80, substanceSource: "custom" },
    widthPx: 500,
    heightPx: 320,
    functions: [],
    features: [],
    metadata: {},
    ...overrides,
  };
}

function mergeGraphConfig(config: GraphConfig, patch: Partial<GraphConfig>): GraphConfig {
  return { ...config, ...patch };
}

test("columnsColumnCountPatch preserves existing columns and creates missing ones", () => {
  let created = 0;
  const block: Extract<ContentBlock, { kind: "columns" }> = {
    id: "columns",
    kind: "columns",
    columnCount: 2,
    columns: [[textBlock("left")], [textBlock("right")]],
  };

  const patch = columnsColumnCountPatch(block, 3, () => textBlock(`new-${++created}`));

  assert.equal(patch.columnCount, 3);
  assert.equal(patch.columns?.[0]?.[0]?.id, "left");
  assert.equal(patch.columns?.[1]?.[0]?.id, "right");
  assert.equal(patch.columns?.[2]?.[0]?.id, "new-1");
});

test("module.update applies inspector layout patches to selected nested modules", () => {
  const initialTable = tableBlock("table");
  const initialColumns: Extract<ContentBlock, { kind: "columns" }> = {
    id: "columns",
    kind: "columns",
    columnCount: 2,
    columns: [[spaceBlock("space", 4), initialTable], [textBlock("keep")]],
  };
  let questions = [question("q1", [initialColumns, textBlock("outside")])];

  questions = updateQuestionModule(questions, "space", { lines: inspectorSpaceLines("7.2") });
  const updatedSpace = findContentBlock(questions[0].contentBlocks, "space");
  assert.equal(updatedSpace?.kind, "space");
  assert.equal(updatedSpace?.kind === "space" ? updatedSpace.lines : undefined, 7);

  questions = updateQuestionModule(questions, "table", tableRowsCountPatch(initialTable, 3));
  const tableAfterRows = findContentBlock(questions[0].contentBlocks, "table");
  assert.equal(tableAfterRows?.kind, "table");
  assert.equal(tableAfterRows?.kind === "table" ? tableAfterRows.rows.length : undefined, 3);

  if (tableAfterRows?.kind !== "table") throw new Error("Expected updated table block.");
  questions = updateQuestionModule(questions, "table", tableColumnCountPatch(tableAfterRows, 3));
  const tableAfterColumns = findContentBlock(questions[0].contentBlocks, "table");
  assert.equal(tableAfterColumns?.kind, "table");
  assert.deepEqual(tableAfterColumns?.kind === "table" ? tableAfterColumns.rows.map((row) => row.length) : [], [3, 3, 3]);

  const columnsAfterNestedUpdates = findContentBlock(questions[0].contentBlocks, "columns");
  if (columnsAfterNestedUpdates?.kind !== "columns") throw new Error("Expected columns block.");
  questions = updateQuestionModule(
    questions,
    "columns",
    columnsColumnCountPatch(columnsAfterNestedUpdates, 3, () => textBlock("new-column-text")),
  );
  const finalColumns = findContentBlock(questions[0].contentBlocks, "columns");
  assert.equal(finalColumns?.kind, "columns");
  assert.equal(finalColumns?.kind === "columns" ? finalColumns.columnCount : undefined, 3);
  assert.equal(finalColumns?.kind === "columns" ? finalColumns.columns[2]?.[0]?.id : undefined, "new-column-text");
  assert.equal(findContentBlock(questions[0].contentBlocks, "keep")?.kind, "text");
  assert.equal(findContentBlock(questions[0].contentBlocks, "outside")?.kind, "text");
});

test("module.update applies solution display and mark tick patches", () => {
  const initialTable = tableBlock("solution-table-1");
  let questions = [question("q1", [initialTable])];

  assert.equal(contentBlockDisplayVisibility(initialTable), "solution");

  questions = updateQuestionModule(questions, "solution-table-1", contentBlockVisibilityPatch(initialTable, "always"));
  const visibleTable = findContentBlock(questions[0].contentBlocks, "solution-table-1");
  assert.equal(visibleTable?.kind, "table");
  if (!visibleTable) throw new Error("Expected table block.");
  assert.equal(contentBlockDisplayVisibility(visibleTable), "always");
  assert.equal(visibleTable.solutionOnly, false);
  assert.equal(visibleTable.studentOnly, false);

  questions = updateQuestionModule(questions, "solution-table-1", {
    ...contentBlockVisibilityPatch(visibleTable, "solution"),
    ...contentBlockMarkTicksPatch(2),
  });
  const solutionTable = findContentBlock(questions[0].contentBlocks, "solution-table-1");
  assert.equal(solutionTable?.kind, "table");
  assert.equal(solutionTable ? contentBlockDisplayVisibility(solutionTable) : undefined, "solution");
  assert.equal(solutionTable?.markTicks, 2);

  if (!solutionTable) throw new Error("Expected solution table block.");
  questions = updateQuestionModule(questions, "solution-table-1", contentBlockVisibilityPatch(solutionTable, "student"));
  const studentTable = findContentBlock(questions[0].contentBlocks, "solution-table-1");
  assert.equal(studentTable ? contentBlockDisplayVisibility(studentTable) : undefined, "student");
  assert.equal(studentTable?.markTicks, undefined);
});

test("solution tick helpers separate text-line ticks from surface ticks", () => {
  const solutionText: ContentBlock = { id: "solution-text", kind: "text", text: "x = 3" };
  const legacyTickedText: ContentBlock = { ...solutionText, markTicks: 1 };
  const solutionTable = tableBlock("solution-table");
  const solutionDiagram = diagramBlock("solution-diagram", { type: "graph2d", functions: [], features: [] });
  const solutionSpace = spaceBlock("solution-space", 4);

  assert.equal(contentBlockSupportsSolutionSurfaceTicks(solutionText), false);
  assert.match(contentBlockSolutionTickHelp(solutionText), /\[\[marks:1\]\]/);
  assert.equal(contentBlockSolutionTickLabel(solutionText), "Block ticks");

  assert.equal(contentBlockSupportsSolutionSurfaceTicks(legacyTickedText), true);
  assert.equal(contentBlockSupportsSolutionSurfaceTicks(solutionTable), true);
  assert.equal(contentBlockSolutionTickLabel(solutionTable), "Surface ticks");
  assert.match(contentBlockSolutionTickHelp(solutionDiagram), /completed directly/);

  assert.equal(contentBlockSupportsSolutionSurfaceTicks(solutionSpace), false);
  assert.match(contentBlockSolutionTickHelp(solutionSpace), /pair them with/);
});

test("module.update applies inspector diagram patches and preserves unrelated modules", () => {
  let geometryConfig = penroseConfig();
  let networkConfig = penroseConfig({
    type: "network",
    data: {
      ...DEFAULT_NETWORK_DATA,
      hidePoints: false,
      hidePointLabels: false,
    },
  });
  let setConfig = penroseConfig({
    type: "setDiagram",
    data: {
      universe: { name: "S", label: "S" },
      sets: [
        { type: "set", name: "P", label: "P" },
        { type: "set", name: "Q", label: "Q" },
      ],
      regions: [{ name: "onlyP" }, { name: "both" }, { name: "onlyQ" }, { name: "outside" }],
    },
  });
  let imageConfig: GraphConfig = {
    type: "image",
    data: {
      src: "data:image/png;base64,abc",
      name: "Original",
      alt: "Original alt",
      naturalWidth: 800,
      naturalHeight: 600,
    },
    widthPx: 420,
    heightPx: 260,
    functions: [{ expression: "x" }],
    features: [{ kind: "point", x: 1, y: 2 }],
  };
  let questions = [
    question("q1", [
      diagramBlock("geometry", geometryConfig),
      diagramBlock("network", networkConfig),
      diagramBlock("set", setConfig),
      diagramBlock("image", imageConfig),
      textBlock("untouched"),
    ]),
  ];

  geometryConfig = mergeGraphConfig(geometryConfig, penroseScalePatch(geometryConfig, 125));
  questions = updateQuestionModule(questions, "geometry", { graphConfig: geometryConfig });
  geometryConfig = mergeGraphConfig(geometryConfig, penroseResamplePatch(geometryConfig, "fixed-layout"));
  questions = updateQuestionModule(questions, "geometry", { graphConfig: geometryConfig });
  const updatedGeometry = findContentBlock(questions[0].contentBlocks, "geometry");
  assert.equal(updatedGeometry?.kind, "diagram");
  assert.equal(updatedGeometry?.kind === "diagram" ? updatedGeometry.graphConfig.scalePercent : undefined, 125);
  assert.equal(updatedGeometry?.kind === "diagram" ? updatedGeometry.graphConfig.options?.variation : undefined, "fixed-layout");

  networkConfig = mergeGraphConfig(networkConfig, networkPresetPatch(networkConfig));
  questions = updateQuestionModule(questions, "network", { graphConfig: networkConfig });
  networkConfig = mergeGraphConfig(networkConfig, networkVisibilityPatch(networkConfig, { hidePoints: true, hidePointLabels: true }));
  questions = updateQuestionModule(questions, "network", { graphConfig: networkConfig });
  const updatedNetwork = findContentBlock(questions[0].contentBlocks, "network");
  assert.equal(updatedNetwork?.kind, "diagram");
  assert.equal(
    updatedNetwork?.kind === "diagram" && typeof updatedNetwork.graphConfig.data === "object"
      ? (updatedNetwork.graphConfig.data as typeof DEFAULT_NETWORK_DATA).hidePoints
      : undefined,
    true,
  );
  assert.equal(
    updatedNetwork?.kind === "diagram" && typeof updatedNetwork.graphConfig.data === "object"
      ? (updatedNetwork.graphConfig.data as typeof DEFAULT_NETWORK_DATA).hidePointLabels
      : undefined,
    true,
  );
  assert.equal(updatedNetwork?.kind === "diagram" ? updatedNetwork.graphConfig.options?.substanceSource : undefined, undefined);

  setConfig = mergeGraphConfig(setConfig, setDiagramNotationPatch(setConfig));
  questions = updateQuestionModule(questions, "set", { graphConfig: setConfig });
  setConfig = mergeGraphConfig(setConfig, setDiagramCountLabelsPatch(setConfig, true));
  questions = updateQuestionModule(questions, "set", { graphConfig: setConfig });
  setConfig = mergeGraphConfig(setConfig, setDiagramShadingPatch(setConfig, 3));
  questions = updateQuestionModule(questions, "set", { graphConfig: setConfig });
  const updatedSet = findContentBlock(questions[0].contentBlocks, "set");
  const updatedSetData =
    updatedSet?.kind === "diagram"
      ? (updatedSet.graphConfig.data as {
          universe: { countLabel: string };
          sets: Array<{ countLabel: string }>;
          regions: Array<{ label: string; shaded: boolean }>;
        })
      : null;
  assert.equal(updatedSetData?.universe.countLabel, "30");
  assert.deepEqual(
    updatedSetData?.sets.map((set) => set.countLabel),
    ["18", "16"],
  );
  assert.deepEqual(
    updatedSetData?.regions.map((region) => region.label),
    ["8", "10", "6", "6"],
  );
  assert.deepEqual(
    updatedSetData?.regions.map((region) => region.shaded),
    [false, false, false, true],
  );

  imageConfig = mergeGraphConfig(imageConfig, {
    ...imageDataPatch(imageConfig, { name: "Updated", alt: "Updated alt" }),
    ...imageSizePatch(360, 220),
  });
  questions = updateQuestionModule(questions, "image", { graphConfig: imageConfig });
  const updatedImage = findContentBlock(questions[0].contentBlocks, "image");
  assert.equal(updatedImage?.kind, "diagram");
  assert.equal(updatedImage?.kind === "diagram" ? updatedImage.graphConfig.widthPx : undefined, 360);
  assert.equal(updatedImage?.kind === "diagram" ? updatedImage.graphConfig.heightPx : undefined, 220);
  assert.deepEqual(updatedImage?.kind === "diagram" ? updatedImage.graphConfig.functions : undefined, []);
  assert.deepEqual(updatedImage?.kind === "diagram" ? updatedImage.graphConfig.features : undefined, []);
  assert.deepEqual(updatedImage?.kind === "diagram" ? updatedImage.graphConfig.data : undefined, {
    src: "data:image/png;base64,abc",
    name: "Updated",
    alt: "Updated alt",
    mimeType: "",
    naturalWidth: 800,
    naturalHeight: 600,
  });
  assert.equal(findContentBlock(questions[0].contentBlocks, "untouched")?.kind, "text");
});

test("Penrose scale and resample patches reset fixed image dimensions", () => {
  const scaled = penroseScalePatch(penroseConfig(), 125);
  assert.equal(scaled.scalePercent, 125);
  assert.equal(scaled.options?.scalePercent, 125);
  assert.equal(scaled.widthPx, undefined);
  assert.equal(scaled.heightPx, undefined);

  const resampled = penroseResamplePatch(penroseConfig(), "fixed-variation");
  assert.equal(resampled.options?.variation, "fixed-variation");
  assert.equal(resampled.widthPx, undefined);
  assert.equal(resampled.heightPx, undefined);
});

test("network inspector patches save structured data and remove stale Substance overrides", () => {
  const config = penroseConfig({
    type: "network",
    data: {
      ...DEFAULT_NETWORK_DATA,
      hidePoints: false,
      hidePointLabels: false,
    },
  });

  const hiddenDots = networkVisibilityPatch(config, { hidePoints: true });
  assert.equal(hiddenDots.options?.substanceSource, undefined);
  assert.equal((hiddenDots.data as typeof DEFAULT_NETWORK_DATA).hidePoints, true);
  assert.equal((hiddenDots.data as typeof DEFAULT_NETWORK_DATA).hidePointLabels, false);
  assert.equal(hiddenDots.widthPx, undefined);
  assert.equal(hiddenDots.heightPx, undefined);

  const preset = networkPresetPatch(config);
  const presetData = preset.data as typeof DEFAULT_NETWORK_DATA;
  assert.equal(presetData.hidePoints, false);
  assert.equal(presetData.hidePointLabels, false);
  assert.deepEqual(
    presetData.objects.map((object) => object.label),
    ["A", "B", "C"],
  );
  assert.equal(presetData.relationships.length, DEFAULT_NETWORK_DATA.relationships.length);
});

test("set diagram helper patches update labels, totals, and shading", () => {
  const config = penroseConfig({
    type: "setDiagram",
    data: {
      universe: { name: "S", label: "S" },
      sets: [
        { type: "set", name: "P", label: "P" },
        { type: "set", name: "Q", label: "Q" },
      ],
      regions: [{ name: "onlyP" }, { name: "both" }, { name: "onlyQ" }, { name: "outside" }],
    },
  });

  const notation = setDiagramNotationPatch(config);
  const notationData = notation.data as { regions: Array<{ label: string }> };
  assert.deepEqual(
    notationData.regions.map((region) => region.label),
    ["P \\cap Q'", "P \\cap Q", "P' \\cap Q", "(P \\cup Q)'"],
  );
  assert.equal(notation.options?.substanceSource, undefined);

  const counts = setDiagramCountLabelsPatch(config, true);
  const countData = counts.data as {
    universe: { countLabel: string };
    sets: Array<{ countLabel: string }>;
    regions: Array<{ label: string }>;
  };
  assert.equal(countData.universe.countLabel, "30");
  assert.deepEqual(
    countData.sets.map((set) => set.countLabel),
    ["18", "16"],
  );
  assert.deepEqual(
    countData.regions.map((region) => region.label),
    ["8", "10", "6", "6"],
  );

  const shaded = setDiagramShadingPatch(config, 2);
  const shadedData = shaded.data as { regions: Array<{ shaded: boolean }> };
  assert.deepEqual(
    shadedData.regions.map((region) => region.shaded),
    [false, false, true, false],
  );

  const threeSet = setDiagramSetCountPatch(config, 3);
  const threeSetData = threeSet.data as {
    setCount: number;
    sets: Array<{ name: string; label: string }>;
    regions: Array<{ name: string }>;
  };
  assert.equal(threeSetData.setCount, 3);
  assert.deepEqual(
    threeSetData.sets.map((set) => set.name),
    ["P", "Q", "C"],
  );
  assert.deepEqual(
    threeSetData.regions.map((region) => region.name),
    ["onlyA", "onlyB", "onlyC", "onlyAB", "onlyAC", "onlyBC", "intersection", "outside"],
  );

  const threeSetNotation = setDiagramNotationPatch({
    ...config,
    data: threeSetData,
  });
  const threeSetNotationData = threeSetNotation.data as { regions: Array<{ label: string }> };
  assert.deepEqual(
    threeSetNotationData.regions.map((region) => region.label),
    [
      "P \\cap Q' \\cap C'",
      "P' \\cap Q \\cap C'",
      "P' \\cap Q' \\cap C",
      "P \\cap Q \\cap C'",
      "P \\cap Q' \\cap C",
      "P' \\cap Q \\cap C",
      "P \\cap Q \\cap C",
      "(P \\cup Q \\cup C)'",
    ],
  );
});

test("image patch preserves image metadata and clears rendered graph content", () => {
  const patch = imageDataPatch(
    {
      type: "image",
      data: {
        src: "data:image/png;base64,abc",
        name: "Original",
        alt: "Original alt",
        mimeType: "image/png",
        naturalWidth: 800,
        naturalHeight: 600,
      },
      functions: [{ expression: "x" }],
      features: [{ kind: "point", x: 1, y: 2 }],
    },
    { name: "Updated", alt: "Updated alt" },
  );

  assert.deepEqual(patch.data, {
    src: "data:image/png;base64,abc",
    name: "Updated",
    alt: "Updated alt",
    mimeType: "image/png",
    naturalWidth: 800,
    naturalHeight: 600,
  });
  assert.deepEqual(patch.functions, []);
  assert.deepEqual(patch.features, []);
});

test("numeric inspector helpers clamp editable values", () => {
  assert.equal(inspectorSpaceLines("4.7"), 5);
  assert.equal(inspectorSpaceLines(-2), 0);
  assert.equal(inspectorSpaceLines(Number.NaN), 3);

  assert.deepEqual(
    graphInspectorWidthPatch({ type: "graph2d", lockAspectRatio: true, equalScale: false }, "640", () => 360),
    {
      widthPx: 640,
      heightPx: 360,
    },
  );
  assert.deepEqual(
    graphInspectorWidthPatch({ type: "graph2d" }, "", () => 360),
    { widthPx: undefined },
  );
});

test("vector and 3D patches update nested metadata without dropping existing metadata", () => {
  const vectorPatch = vector2dLabelStylePatch(
    {
      ...DEFAULT_VECTOR_2D_GRAPH,
      metadata: {
        keep: true,
        vector2d: {
          labelStyle: "boldLower",
          vectors: [
            { id: "a", name: "a", start: [0, 0], components: [2, 3] },
            { id: "custom", name: "kept", start: [0, 0], components: [1, 1] },
          ],
        },
      },
    },
    "arrow",
  );
  const vectorMetadata = vectorPatch.metadata as {
    keep?: boolean;
    vector2d: { labelStyle: string; vectors: Array<{ name: string }> };
  };
  assert.equal(vectorMetadata.keep, true);
  assert.equal(vectorMetadata.vector2d.labelStyle, "arrow");
  assert.deepEqual(
    vectorMetadata.vector2d.vectors.map((vector) => vector.name),
    ["AB", "kept"],
  );

  const viewPatch = graph3dViewPatch({ type: "graph3d", metadata: { keep: true } }, { az: 1.2 });
  assert.deepEqual(viewPatch.metadata?.keep, true);
  assert.equal((viewPatch.metadata?.view3d as { az: number }).az, 1.2);

  const resetPatch = graph3dResetViewPatch({ type: "graph3d", metadata: { keep: true } });
  assert.deepEqual(resetPatch.metadata, { keep: true, view3d: DEFAULT_3D_VIEW_STATE });
});
