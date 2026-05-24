import type { ContentBlock } from "@mauth-studio/shared";

import { MAUTH_DOCUMENT_ACTION_TYPES, type MauthDocumentAction } from "./mauthActions.ts";
import { validateMauthDiagramConfig } from "./mauthDiagramValidation.ts";
import {
  MAUTH_DIAGRAM_SETTINGS_RENDERERS,
  MAUTH_MODULE_SETTINGS_KINDS,
  MAUTH_SET_DIAGRAM_LABEL_PRESETS,
  MAUTH_SET_DIAGRAM_SHADING_KEYS,
} from "./mauthSettingsActions.ts";

export interface MauthActionValidationIssue {
  path: string;
  message: string;
  expected?: string;
}

export interface MauthActionValidationResult {
  ok: boolean;
  issues: MauthActionValidationIssue[];
}

const ACTION_TYPE_SET = new Set<string>(MAUTH_DOCUMENT_ACTION_TYPES);
const CONTENT_BLOCK_KINDS = new Set(["text", "choices", "table", "diagram", "columns", "space", "pageBreak"]);
const CONTENT_VISIBILITY = new Set(["always", "student", "solution"]);
const ALIGNMENTS = new Set(["left", "center", "right"]);
const DIAGRAM_TEXT_SIDES = new Set(["none", "left", "right"]);
const PLACEMENTS = new Set(["before", "after"]);
const ORDER_ITEM_KINDS = new Set(["block", "part", "subpart"]);
const CHOICE_NUMBERING_STYLES = new Set(["roman", "upper-alpha", "lower-alpha", "decimal", "bullet"]);
const CHOICE_LAYOUTS = new Set(["vertical", "two-column", "inline"]);
const TABLE_CELL_ALIGNMENTS = new Set(["left", "center", "right"]);
const MODULE_SETTINGS_KINDS = new Set<string>(MAUTH_MODULE_SETTINGS_KINDS);
const DIAGRAM_SETTINGS_RENDERERS = new Set<string>(MAUTH_DIAGRAM_SETTINGS_RENDERERS);
const SET_DIAGRAM_LABEL_PRESETS = new Set<string>(MAUTH_SET_DIAGRAM_LABEL_PRESETS);
const SET_DIAGRAM_SHADING_KEYS = new Set<string>(MAUTH_SET_DIAGRAM_SHADING_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function addIssue(issues: MauthActionValidationIssue[], path: string, message: string, expected?: string) {
  issues.push({ path, message, ...(expected ? { expected } : {}) });
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function stringField(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[], optional = false) {
  const value = record[key];
  if (value === undefined && optional) return;
  if (typeof value !== "string" || !value.trim()) addIssue(issues, `${path}.${key}`, "must be a non-empty string", "string");
}

function stringValueField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthActionValidationIssue[],
  optional = false,
) {
  const value = record[key];
  if (value === undefined && optional) return;
  if (typeof value !== "string") addIssue(issues, `${path}.${key}`, "must be a string", "string");
}

function booleanField(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[], optional = false) {
  const value = record[key];
  if (value === undefined && optional) return;
  if (typeof value !== "boolean") addIssue(issues, `${path}.${key}`, "must be a boolean", "boolean");
}

function numberField(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[], optional = false) {
  const value = record[key];
  if (value === undefined && optional) return;
  if (typeof value !== "number" || !Number.isFinite(value)) addIssue(issues, `${path}.${key}`, "must be a finite number", "number");
}

function recordField(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[], optional = false) {
  const value = record[key];
  if (value === undefined && optional) return undefined;
  if (!isRecord(value)) {
    addIssue(issues, `${path}.${key}`, "must be an object", "object");
    return undefined;
  }
  return value;
}

function arrayField(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[], optional = false) {
  const value = record[key];
  if (value === undefined && optional) return undefined;
  if (!Array.isArray(value)) {
    addIssue(issues, `${path}.${key}`, "must be an array", "array");
    return undefined;
  }
  return value;
}

function enumField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: Set<string>,
  issues: MauthActionValidationIssue[],
  optional = false,
) {
  const value = record[key];
  if (value === undefined && optional) return;
  if (typeof value !== "string" || !values.has(value)) {
    addIssue(issues, `${path}.${key}`, `must be one of: ${[...values].join(", ")}`, [...values].join(" | "));
  }
}

function stringArrayField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthActionValidationIssue[],
  optional = false,
) {
  const values = arrayField(record, key, path, issues, optional);
  if (!values) return;
  values.forEach((value, index) => {
    if (typeof value !== "string") addIssue(issues, `${path}.${key}[${index}]`, "must be a string", "string");
  });
}

function numberFields(record: Record<string, unknown>, keys: readonly string[], path: string, issues: MauthActionValidationIssue[]) {
  keys.forEach((key) => numberField(record, key, path, issues, true));
}

function booleanFields(record: Record<string, unknown>, keys: readonly string[], path: string, issues: MauthActionValidationIssue[]) {
  keys.forEach((key) => booleanField(record, key, path, issues, true));
}

function validateVisibilityFields(record: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  enumField(record, "visibility", path, CONTENT_VISIBILITY, issues, true);
  booleanField(record, "solutionOnly", path, issues, true);
  booleanField(record, "studentOnly", path, issues, true);
  numberField(record, "markTicks", path, issues, true);
  if (
    record.markTicks !== undefined &&
    (typeof record.markTicks !== "number" || !Number.isInteger(record.markTicks) || record.markTicks < 0 || record.markTicks > 20)
  ) {
    addIssue(issues, `${path}.markTicks`, "must be an integer between 0 and 20", "integer 0..20");
  }
  if (record.markTicks !== undefined && record.visibility !== "solution" && record.solutionOnly !== true) {
    addIssue(issues, `${path}.markTicks`, "mark ticks are only allowed on solution-only blocks", 'visibility: "solution"');
  }
}

function isSolutionOnlyTextBlock(value: Record<string, unknown>) {
  return value.visibility === "solution" || value.solutionOnly === true;
}

function validateContentBlock(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a content block object", "ContentBlock");
    return;
  }

  stringField(value, "id", path, issues);
  enumField(value, "kind", path, CONTENT_BLOCK_KINDS, issues);
  validateVisibilityFields(value, path, issues);

  if (value.kind === "text") {
    stringField(value, "text", path, issues);
    if (typeof value.text === "string" && /\[\[\s*marks\s*:/i.test(value.text) && !isSolutionOnlyTextBlock(value)) {
      addIssue(
        issues,
        `${path}.text`,
        "mark tick annotations are only allowed in solution-only text blocks",
        'solution text with visibility: "solution"',
      );
    }
    if (
      typeof value.text === "string" &&
      /^\s*(?:\*\*)?Solution\b/i.test(value.text) &&
      value.visibility !== "solution" &&
      value.solutionOnly !== true
    ) {
      addIssue(issues, `${path}.visibility`, "solution text blocks must be solution-only", 'visibility: "solution"');
    }
    return;
  }

  if (value.kind === "choices") {
    stringArrayField(value, "choices", path, issues);
    enumField(value, "numberingStyle", path, CHOICE_NUMBERING_STYLES, issues, true);
    enumField(value, "layout", path, CHOICE_LAYOUTS, issues, true);
    return;
  }

  if (value.kind === "table") {
    stringArrayField(value, "headers", path, issues);
    const rows = arrayField(value, "rows", path, issues);
    rows?.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) {
        addIssue(issues, `${path}.rows[${rowIndex}]`, "must be an array of strings", "string[]");
        return;
      }
      row.forEach((cell, cellIndex) => {
        if (typeof cell !== "string") addIssue(issues, `${path}.rows[${rowIndex}][${cellIndex}]`, "must be a string", "string");
      });
    });
    booleanField(value, "showHeader", path, issues, true);
    enumField(value, "tableAlign", path, ALIGNMENTS, issues, true);
    enumField(value, "cellAlignment", path, TABLE_CELL_ALIGNMENTS, issues, true);
    return;
  }

  if (value.kind === "diagram") {
    enumField(value, "diagramAlign", path, ALIGNMENTS, issues, true);
    enumField(value, "diagramTextSide", path, DIAGRAM_TEXT_SIDES, issues, true);
    validateMauthDiagramConfig(value.graphConfig, `${path}.graphConfig`, issues);
    return;
  }

  if (value.kind === "columns") {
    if (value.columnCount !== undefined && value.columnCount !== 2 && value.columnCount !== 3 && value.columnCount !== 4) {
      addIssue(issues, `${path}.columnCount`, "must be 2, 3, or 4", "2 | 3 | 4");
    }
    const columns = arrayField(value, "columns", path, issues);
    columns?.forEach((column, columnIndex) => {
      if (!Array.isArray(column)) {
        addIssue(issues, `${path}.columns[${columnIndex}]`, "must be an array of content blocks", "ContentBlock[]");
        return;
      }
      column.forEach((block, blockIndex) => validateContentBlock(block, `${path}.columns[${columnIndex}][${blockIndex}]`, issues));
    });
    return;
  }

  if (value.kind === "space") {
    numberField(value, "lines", path, issues);
    if (value.visibility !== "student" && value.studentOnly !== true) {
      addIssue(issues, `${path}.visibility`, "answer-space blocks must be student-only", 'visibility: "student"');
    }
  }
}

function validateContentBlocks(record: Record<string, unknown>, key: string, path: string, issues: MauthActionValidationIssue[]) {
  const blocks = arrayField(record, key, path, issues);
  blocks?.forEach((block, index) => validateContentBlock(block, `${path}.${key}[${index}]`, issues));
}

function validateOrderItem(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an order item object", "{ kind, id }");
    return;
  }
  enumField(value, "kind", path, ORDER_ITEM_KINDS, issues);
  stringField(value, "id", path, issues);
}

function validateItemOrder(record: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  const items = arrayField(record, "itemOrder", path, issues, true);
  items?.forEach((item, index) => validateOrderItem(item, `${path}.itemOrder[${index}]`, issues));
}

function validateQuestionLike(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a question object", "Question");
    return;
  }
  stringField(value, "id", path, issues);
  numberField(value, "marks", path, issues);
  validateContentBlocks(value, "contentBlocks", path, issues);
  booleanField(value, "pageBreakAfter", path, issues, true);
  validateItemOrder(value, path, issues);

  const parts = arrayField(value, "parts", path, issues, true);
  parts?.forEach((part, index) => validatePartLike(part, `${path}.parts[${index}]`, issues));
}

function validatePartLike(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a part object", "Part");
    return;
  }
  stringField(value, "id", path, issues);
  stringField(value, "label", path, issues, true);
  stringField(value, "text", path, issues, true);
  numberField(value, "marks", path, issues);
  booleanField(value, "pageBreakBefore", path, issues, true);
  validateContentBlocks(value, "contentBlocks", path, issues);
  validateItemOrder(value, path, issues);

  const subparts = arrayField(value, "subparts", path, issues, true);
  subparts?.forEach((subpart, index) => validateSubpartLike(subpart, `${path}.subparts[${index}]`, issues));
}

function validateSubpartLike(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a subpart object", "Subpart");
    return;
  }
  stringField(value, "id", path, issues);
  stringField(value, "label", path, issues, true);
  stringField(value, "text", path, issues, true);
  numberField(value, "marks", path, issues);
  booleanField(value, "pageBreakBefore", path, issues, true);
  validateContentBlocks(value, "contentBlocks", path, issues);
}

function validateScope(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a scope object", "{ kind, questionId, ... }");
    return;
  }
  enumField(value, "kind", path, new Set(["question", "part", "subpart"]), issues);
  stringField(value, "questionId", path, issues);
  if (value.kind === "part" || value.kind === "subpart") stringField(value, "partId", path, issues);
  if (value.kind === "subpart") stringField(value, "subpartId", path, issues);
}

function validateModuleSettingsUpdate(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a module settings object", "{ kind, ...settings }");
    return;
  }
  enumField(value, "kind", path, MODULE_SETTINGS_KINDS, issues);
  if (typeof value.kind !== "string") return;

  if (value.kind === "space") {
    numberField(value, "lines", path, issues);
    return;
  }

  if (value.kind === "table") {
    numberFields(value, ["rows", "columns"], path, issues);
    enumField(value, "tableAlign", path, ALIGNMENTS, issues, true);
    enumField(value, "cellAlignment", path, TABLE_CELL_ALIGNMENTS, issues, true);
    booleanField(value, "showHeader", path, issues, true);
    return;
  }

  if (value.kind === "columns") {
    if (value.columnCount !== 2 && value.columnCount !== 3 && value.columnCount !== 4) {
      addIssue(issues, `${path}.columnCount`, "must be 2, 3, or 4", "2 | 3 | 4");
    }
    return;
  }

  if (value.kind === "choices") {
    enumField(value, "numberingStyle", path, CHOICE_NUMBERING_STYLES, issues, true);
    enumField(value, "layout", path, CHOICE_LAYOUTS, issues, true);
    return;
  }

  if (value.kind === "diagram") {
    enumField(value, "diagramAlign", path, ALIGNMENTS, issues, true);
    enumField(value, "diagramTextSide", path, DIAGRAM_TEXT_SIDES, issues, true);
  }
}

function validatePenroseSettings(value: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  numberField(value, "scalePercent", path, issues, true);
  booleanField(value, "original", path, issues, true);
  booleanField(value, "resample", path, issues, true);
  stringValueField(value, "variation", path, issues, true);
}

function validateSetDiagramShading(value: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  if (!hasOwn(value, "shading")) return;
  const shading = value.shading;
  if (shading === null) return;
  if (typeof shading === "number" && Number.isFinite(shading)) return;
  if (typeof shading === "string" && SET_DIAGRAM_SHADING_KEYS.has(shading)) return;
  addIssue(
    issues,
    `${path}.shading`,
    "must be a supported set-region shading key, region index, or null",
    "none | onlyA | intersection | onlyB | outside | number | null",
  );
}

function validateDiagramSettingsUpdate(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a diagram settings object", "{ renderer, ...settings }");
    return;
  }
  enumField(value, "renderer", path, DIAGRAM_SETTINGS_RENDERERS, issues);
  if (typeof value.renderer !== "string") return;

  if (value.renderer === "graph2d" || value.renderer === "geometry2d") {
    numberFields(
      value,
      [
        "widthPx",
        "heightPx",
        "xMin",
        "xMax",
        "yMin",
        "yMax",
        "gridMajorStep",
        "gridMinorStep",
        "gridMajorStepX",
        "gridMajorStepY",
        "gridMinorStepX",
        "gridMinorStepY",
      ],
      path,
      issues,
    );
    booleanFields(
      value,
      [
        "showAxes",
        "showGrid",
        "showMajorGrid",
        "showAxisLabels",
        "showAxisNumbers",
        "showArrows",
        "showFunctionArrows",
        "lockAspectRatio",
        "equalScale",
      ],
      path,
      issues,
    );
    return;
  }

  if (value.renderer === "vector2d") {
    numberFields(value, ["widthPx", "heightPx", "xMin", "xMax", "yMin", "yMax"], path, issues);
    booleanFields(
      value,
      ["showAxes", "showGrid", "showMajorGrid", "showAxisLabels", "showAxisNumbers", "showArrows", "equalScale"],
      path,
      issues,
    );
    enumField(value, "labelStyle", path, new Set(["boldLower", "arrow", "custom"]), issues, true);
    return;
  }

  if (value.renderer === "graph3d") {
    numberFields(value, ["widthPx", "heightPx"], path, issues);
    booleanField(value, "resetView", path, issues, true);
    const view = recordField(value, "view", path, issues, true);
    if (view) numberFields(view, ["az", "el", "bank"], `${path}.view`, issues);
    return;
  }

  if (value.renderer === "statsChart") {
    numberFields(value, ["widthPx", "heightPx", "fillOpacity"], path, issues);
    stringValueField(value, "chartType", path, issues, true);
    stringValueField(value, "fillColor", path, issues, true);
    booleanFields(value, ["showGrid", "showFill"], path, issues);
    return;
  }

  if (value.renderer === "geometricConstruction") {
    validatePenroseSettings(value, path, issues);
    return;
  }

  if (value.renderer === "network") {
    validatePenroseSettings(value, path, issues);
    booleanFields(value, ["preset", "showNodeDots", "showNodeLabels"], path, issues);
    return;
  }

  if (value.renderer === "setDiagram") {
    validatePenroseSettings(value, path, issues);
    enumField(value, "labels", path, SET_DIAGRAM_LABEL_PRESETS, issues, true);
    validateSetDiagramShading(value, path, issues);
    return;
  }

  if (value.renderer === "image") {
    numberFields(value, ["widthPx", "heightPx"], path, issues);
    stringValueField(value, "name", path, issues, true);
    stringValueField(value, "alt", path, issues, true);
  }
}

function validateTarget(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  validateScope(value, path, issues);
}

function validatePositionedPlacement(record: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  enumField(record, "position", path, PLACEMENTS, issues);
}

function validatePartPlacement(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a placement object", "{ partId, position }");
    return;
  }
  stringField(value, "partId", path, issues);
  validatePositionedPlacement(value, path, issues);
}

function validateSubpartPlacement(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a placement object", "{ subpartId, position }");
    return;
  }
  stringField(value, "subpartId", path, issues);
  validatePositionedPlacement(value, path, issues);
}

function validateBlockPlacement(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a placement object", "{ blockId, position }");
    return;
  }
  stringField(value, "blockId", path, issues);
  validatePositionedPlacement(value, path, issues);
}

function validateMovePlacement(value: unknown, path: string, issues: MauthActionValidationIssue[], allowedItemKinds: readonly string[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be a placement object", "{ item, position } or id placement");
    return;
  }
  validatePositionedPlacement(value, path, issues);
  if (isRecord(value.item)) {
    validateOrderItem(value.item, `${path}.item`, issues);
    if (typeof value.item.kind === "string" && !allowedItemKinds.includes(value.item.kind)) {
      addIssue(issues, `${path}.item.kind`, `must be one of: ${allowedItemKinds.join(", ")}`, allowedItemKinds.join(" | "));
    }
    return;
  }
  if (allowedItemKinds.includes("block")) stringField(value, "blockId", path, issues);
  else if (allowedItemKinds.includes("part")) stringField(value, "partId", path, issues);
  else stringField(value, "subpartId", path, issues);
}

function validateOptionalPlacement(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: MauthActionValidationIssue[],
  validator: (value: unknown, path: string, issues: MauthActionValidationIssue[]) => void,
) {
  if (!hasOwn(record, key)) return;
  validator(record[key], `${path}.${key}`, issues);
}

function validateSourceDestination(value: unknown, path: string, issues: MauthActionValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, "must be an object", "{ questionId, partId }");
    return;
  }
  stringField(value, "questionId", path, issues);
  stringField(value, "partId", path, issues);
}

function validateAction(action: Record<string, unknown>, path: string, issues: MauthActionValidationIssue[]) {
  if (typeof action.type !== "string" || !ACTION_TYPE_SET.has(action.type)) {
    addIssue(issues, `${path}.type`, "must be a supported Mauth action type", "MauthDocumentAction.type");
    return;
  }

  switch (action.type) {
    case "question.add":
      validateQuestionLike(action.question, `${path}.question`, issues);
      stringField(action, "afterQuestionId", path, issues, true);
      break;
    case "question.update":
      stringField(action, "questionId", path, issues);
      recordField(action, "patch", path, issues);
      break;
    case "question.delete":
      stringField(action, "questionId", path, issues);
      if (hasOwn(action, "fallbackQuestion")) validateQuestionLike(action.fallbackQuestion, `${path}.fallbackQuestion`, issues);
      break;
    case "question.reorder":
      stringField(action, "questionId", path, issues);
      stringField(action, "targetQuestionId", path, issues);
      enumField(action, "placement", path, PLACEMENTS, issues);
      break;
    case "part.add":
      stringField(action, "questionId", path, issues);
      validatePartLike(action.part, `${path}.part`, issues);
      validateOptionalPlacement(action, "placement", path, issues, validatePartPlacement);
      break;
    case "part.update":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      recordField(action, "patch", path, issues);
      break;
    case "part.delete":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      break;
    case "part.reorder":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      stringField(action, "targetPartId", path, issues);
      enumField(action, "placement", path, PLACEMENTS, issues);
      break;
    case "part.move":
      stringField(action, "fromQuestionId", path, issues);
      stringField(action, "toQuestionId", path, issues);
      stringField(action, "partId", path, issues);
      validateOptionalPlacement(action, "placement", path, issues, (value, placementPath, placementIssues) =>
        validateMovePlacement(value, placementPath, placementIssues, ["part"]),
      );
      break;
    case "subpart.add":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      validateSubpartLike(action.subpart, `${path}.subpart`, issues);
      validateOptionalPlacement(action, "placement", path, issues, validateSubpartPlacement);
      break;
    case "subpart.update":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      stringField(action, "subpartId", path, issues);
      recordField(action, "patch", path, issues);
      break;
    case "subpart.delete":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      stringField(action, "subpartId", path, issues);
      break;
    case "subpart.reorder":
      stringField(action, "questionId", path, issues);
      stringField(action, "partId", path, issues);
      stringField(action, "subpartId", path, issues);
      stringField(action, "targetSubpartId", path, issues);
      enumField(action, "placement", path, PLACEMENTS, issues);
      break;
    case "subpart.move":
      validateSourceDestination(action.from, `${path}.from`, issues);
      validateSourceDestination(action.to, `${path}.to`, issues);
      stringField(action, "subpartId", path, issues);
      validateOptionalPlacement(action, "placement", path, issues, (value, placementPath, placementIssues) =>
        validateMovePlacement(value, placementPath, placementIssues, ["subpart"]),
      );
      break;
    case "module.add":
    case "solutionSlot.add":
      validateScope(action.scope, `${path}.scope`, issues);
      validateContentBlocks(action, "blocks", path, issues);
      validateOptionalPlacement(action, "placement", path, issues, validateBlockPlacement);
      break;
    case "module.update":
      validateScope(action.scope, `${path}.scope`, issues);
      stringField(action, "blockId", path, issues);
      {
        const patch = recordField(action, "patch", path, issues);
        if (patch && hasOwn(patch, "graphConfig")) validateMauthDiagramConfig(patch.graphConfig, `${path}.patch.graphConfig`, issues);
      }
      break;
    case "module.settings.update":
      validateScope(action.scope, `${path}.scope`, issues);
      stringField(action, "blockId", path, issues);
      validateModuleSettingsUpdate(action.settings, `${path}.settings`, issues);
      break;
    case "module.delete":
      validateScope(action.scope, `${path}.scope`, issues);
      stringField(action, "blockId", path, issues);
      break;
    case "module.reorder":
      validateScope(action.scope, `${path}.scope`, issues);
      stringField(action, "blockId", path, issues);
      stringField(action, "targetBlockId", path, issues);
      enumField(action, "placement", path, PLACEMENTS, issues);
      break;
    case "module.move":
      validateScope(action.fromScope, `${path}.fromScope`, issues);
      validateScope(action.toScope, `${path}.toScope`, issues);
      stringField(action, "blockId", path, issues);
      validateOptionalPlacement(action, "placement", path, issues, (value, placementPath, placementIssues) =>
        validateMovePlacement(value, placementPath, placementIssues, ["block", "part", "subpart"]),
      );
      break;
    case "marks.update":
      validateTarget(action.target, `${path}.target`, issues);
      numberField(action, "marks", path, issues);
      break;
    case "diagram.update": {
      validateScope(action.scope, `${path}.scope`, issues);
      stringField(action, "blockId", path, issues);
      validateMauthDiagramConfig(action.graphConfig, `${path}.graphConfig`, issues);
      break;
    }
    case "diagram.settings.update":
      validateScope(action.scope, `${path}.scope`, issues);
      stringField(action, "blockId", path, issues);
      validateDiagramSettingsUpdate(action.settings, `${path}.settings`, issues);
      break;
    case "pageBreak.set":
      validateTarget(action.target, `${path}.target`, issues);
      booleanField(action, "enabled", path, issues);
      break;
    case "frontMatter.update":
    case "pageFormat.update":
    case "formatting.update":
      recordField(action, "patch", path, issues);
      break;
    case "frontMatter.replace":
      recordField(action, "frontMatter", path, issues);
      break;
    case "frontMatter.logo.set":
      stringField(action, "logoId", path, issues);
      stringField(action, "schoolName", path, issues, true);
      break;
    case "validation.solution.run":
    case "document.validation.run":
      break;
  }
}

export function validateMauthDocumentActionPayloads(actions: readonly unknown[]): MauthActionValidationResult {
  const issues: MauthActionValidationIssue[] = [];
  actions.forEach((action, index) => {
    if (!isRecord(action)) {
      addIssue(issues, `actions[${index}]`, "must be an action object", "MauthDocumentAction");
      return;
    }
    validateAction(action, `actions[${index}]`, issues);
  });
  return { ok: issues.length === 0, issues };
}

export function formatMauthActionValidationIssues(issues: readonly MauthActionValidationIssue[]) {
  const shown = issues.slice(0, 8);
  const suffix =
    issues.length > shown.length ? `; plus ${issues.length - shown.length} more issue${issues.length - shown.length === 1 ? "" : "s"}` : "";
  return `Mauth action validation failed: ${shown
    .map((issue) => {
      const expected = issue.expected ? ` Expected: ${issue.expected}` : "";
      return `${issue.path} ${issue.message}.${expected}`;
    })
    .join("; ")}${suffix}. Repair the action payload and call the same Mauth tool again.`;
}

export function typedMauthDocumentActions(actions: readonly unknown[]): MauthDocumentAction[] {
  return actions as MauthDocumentAction[];
}

export type ValidatedContentBlock = ContentBlock;
