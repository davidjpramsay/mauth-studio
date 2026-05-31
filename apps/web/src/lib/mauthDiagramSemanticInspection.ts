import type { GraphConfig } from "@mauth-studio/shared";

export interface MauthDiagramSemanticWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface MauthDiagramSemanticInspection {
  checks: string[];
  warnings: MauthDiagramSemanticWarning[];
}

interface PenroseCall {
  name: string;
  args: string[];
}

interface PenroseSubstanceSummary {
  labels: Map<string, string>;
  hiddenPoints: Set<string>;
  calls: PenroseCall[];
}

function penroseSourceFromGraphConfig(graphConfig: GraphConfig) {
  const source = graphConfig.options?.substanceSource;
  return typeof source === "string" ? source : "";
}

function cleanPenroseLabel(value: string) {
  return value
    .replace(/\$/g, "")
    .replace(/\\,/g, "")
    .replace(/\\phantom\s*\{[^}]*\}/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePenroseSubstance(source: string): PenroseSubstanceSummary {
  const labels = new Map<string, string>();
  const hiddenPoints = new Set<string>();
  const calls: PenroseCall[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, "").trim();
    if (!line) continue;

    const labelMatch = line.match(/^Label\s+([A-Za-z][\w-]*)\s+(.+)$/);
    if (labelMatch) {
      labels.set(labelMatch[1], cleanPenroseLabel(labelMatch[2]));
      continue;
    }

    const callMatch = line.match(/^([A-Za-z][\w-]*)\s*\((.*)\)\s*$/);
    if (callMatch) {
      const args = callMatch[2]
        .split(",")
        .map((arg) => arg.trim())
        .filter(Boolean);
      calls.push({ name: callMatch[1], args });
      if (callMatch[1] === "HidePoint" && args[0]) hiddenPoints.add(args[0]);
    }
  }

  return { labels, hiddenPoints, calls };
}

function penroseCalls(summary: PenroseSubstanceSummary, name: string) {
  return summary.calls.filter((call) => call.name === name);
}

function penrosePairMatches(args: readonly string[], first: string, second: string, offset = 0) {
  return (args[offset] === first && args[offset + 1] === second) || (args[offset] === second && args[offset + 1] === first);
}

function penroseHasSegment(summary: PenroseSubstanceSummary, first: string, second: string) {
  return penroseCalls(summary, "Segment").some((call) => penrosePairMatches(call.args, first, second, 1));
}

function penroseCirclePoints(summary: PenroseSubstanceSummary) {
  const pointsByCircle = new Map<string, Set<string>>();
  for (const call of summary.calls) {
    if (call.name === "CircleThrough" && call.args.length >= 3) {
      const circleName = call.args[0];
      const throughPoint = call.args[2];
      const bucket = pointsByCircle.get(circleName) ?? new Set<string>();
      bucket.add(throughPoint);
      pointsByCircle.set(circleName, bucket);
    }
    if (call.name === "OnCircle" && call.args.length >= 2) {
      const pointName = call.args[0];
      const circleName = call.args[1];
      const bucket = pointsByCircle.get(circleName) ?? new Set<string>();
      bucket.add(pointName);
      pointsByCircle.set(circleName, bucket);
    }
  }
  return pointsByCircle;
}

function pointOnAnyPenroseCircle(summary: PenroseSubstanceSummary, point: string) {
  return Array.from(penroseCirclePoints(summary).values()).some((points) => points.has(point));
}

function pointsSharePenroseCircle(summary: PenroseSubstanceSummary, points: readonly string[]) {
  return Array.from(penroseCirclePoints(summary).values()).some((circlePoints) => points.every((point) => circlePoints.has(point)));
}

function labelIsVisible(summary: PenroseSubstanceSummary, objectName: string) {
  if (summary.hiddenPoints.has(objectName)) return false;
  const label = summary.labels.get(objectName);
  return typeof label === "string" && label.trim().length > 0;
}

function uppercasePointLabels(rawText: string) {
  return Array.from(new Set(rawText.match(/\b[A-Z]\b/g) ?? []));
}

function normalizedPlainText(value: string) {
  return value
    .replace(/\\mathbf\s*\{([^}]+)\}/g, "$1")
    .replace(/\\vec\s*\{([^}]+)\}/g, "$1")
    .replace(/[{}$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namedChordsFromText(rawText: string) {
  const text = normalizedPlainText(rawText);
  return Array.from(text.matchAll(/\bchord\s+([A-Z])\s*([A-Z])\b/g)).map((match) => [match[1], match[2]] as const);
}

function tangentPointsFromText(rawText: string) {
  const text = normalizedPlainText(rawText);
  return Array.from(text.matchAll(/\btangent(?:\s+to\s+[^.?,;]*)?\s+at\s+([A-Z])\b/g)).map((match) => match[1]);
}

function labelsFromPointList(value: string) {
  return uppercasePointLabels(value);
}

function circlePointGroupsFromText(rawText: string) {
  const text = normalizedPlainText(rawText);
  const groups: string[][] = [];
  for (const match of text.matchAll(
    /\bpoints?\s+([A-Z](?:\s*,\s*[A-Z])*(?:\s*(?:and|&)\s*[A-Z])?)\s+(?:lie|lies|are|is)\s+on\s+(?:the\s+)?(?:same\s+)?(?:circle|circumference)\b/g,
  )) {
    const labels = labelsFromPointList(match[1]);
    if (labels.length >= 2) groups.push(labels);
  }
  for (const match of text.matchAll(
    /\b([A-Z](?:\s*,\s*[A-Z])*(?:\s*(?:and|&)\s*[A-Z])?)\s+(?:are|is)\s+points?\s+on\s+(?:(?:a|the)\s+)?(?:same\s+)?(?:circle|circumference)\b/g,
  )) {
    const labels = labelsFromPointList(match[1]);
    if (labels.length >= 2) groups.push(labels);
  }
  const seen = new Set<string>();
  return groups.filter((group) => {
    const key = [...group].sort().join("");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderedPairKey(first: string, second: string) {
  return [first, second].sort().join("");
}

function parallelChordKeysFromText(rawText: string) {
  const text = normalizedPlainText(rawText);
  const keys = new Set<string>();
  for (const match of text.matchAll(/\btangent\b[^.?!;]*\bparallel\b[^.?!;]*\bchord\s+([A-Z])\s*([A-Z])\b/g)) {
    keys.add(orderedPairKey(match[1], match[2]));
  }
  for (const match of text.matchAll(/\bchord\s+([A-Z])\s*([A-Z])\b[^.?!;]*\bparallel\b[^.?!;]*\btangent\b/g)) {
    keys.add(orderedPairKey(match[1], match[2]));
  }
  return keys;
}

function equalitySegmentsFromText(rawText: string) {
  const text = normalizedPlainText(rawText);
  return Array.from(text.matchAll(/\b([A-Z])\s*([A-Z])\s*=\s*([A-Z])\s*([A-Z])\b/g)).flatMap((match) => [
    [match[1], match[2]] as const,
    [match[3], match[4]] as const,
  ]);
}

function hasCircleGeometryIntent(questionText: string) {
  return /\bcircle\b|\btangent\b|\bchord\b|\bcircumference\b|\bcircle theorem\b|\bangle subtended\b/i.test(questionText);
}

function penroseCircleGeometryWarnings(questionText: string, summary: PenroseSubstanceSummary): MauthDiagramSemanticInspection {
  const checks: string[] = [];
  const warnings: MauthDiagramSemanticWarning[] = [];
  if (!hasCircleGeometryIntent(questionText)) return { checks, warnings };

  const addWarning = (code: string, message: string, severity: MauthDiagramSemanticWarning["severity"] = "warning") => {
    warnings.push({ code, severity, message });
  };

  checks.push("penrose-circle-geometry");
  const tangentPoints = tangentPointsFromText(questionText);
  const chords = namedChordsFromText(questionText);
  const parallelChordKeys = parallelChordKeysFromText(questionText);
  const requiredLabels = uppercasePointLabels(questionText);
  const circlePointGroups = circlePointGroupsFromText(questionText);

  if (!penroseCalls(summary, "CircleThrough").length && !penroseCalls(summary, "OnCircle").length) {
    addWarning("penrose-circle-missing", "The prompt describes a circle, but the Penrose substance does not define circle membership.");
  }

  for (const group of circlePointGroups) {
    if (pointsSharePenroseCircle(summary, group)) continue;
    const missingPoints = group.filter((point) => !pointOnAnyPenroseCircle(summary, point));
    addWarning(
      "penrose-circle-points-missing",
      missingPoints.length
        ? `The prompt names ${group.join(", ")} on a circle, but ${missingPoints.join(", ")} ${
            missingPoints.length === 1 ? "is" : "are"
          } not placed on any Penrose circle.`
        : `The prompt names ${group.join(", ")} on one circle, but the Penrose substance does not put them on the same circle.`,
    );
  }

  for (const label of requiredLabels) {
    if (!labelIsVisible(summary, label)) {
      addWarning(
        "penrose-label-missing",
        `The prompt names point ${label}, but the Penrose diagram has no visible Label ${label}.`,
        "info",
      );
    }
  }

  for (const [objectName, label] of summary.labels.entries()) {
    if (/^[A-Z]$/.test(label) && !requiredLabels.includes(label) && !summary.hiddenPoints.has(objectName)) {
      addWarning(
        "penrose-visible-auxiliary-label",
        `The diagram visibly labels ${label}, but the question prompt does not name ${label}. Hide auxiliary points unless the question names them.`,
        "info",
      );
    }
  }

  const tangentCalls = penroseCalls(summary, "Tangent");
  for (const tangentPoint of tangentPoints) {
    if (!tangentCalls.some((call) => call.args[2] === tangentPoint)) {
      addWarning(
        "penrose-circle-tangent-missing",
        `The prompt says the tangent is at ${tangentPoint}, but the Penrose substance does not contain Tangent(line, circle, ${tangentPoint}).`,
      );
    }
  }

  for (const chord of chords) {
    const [first, second] = chord;
    if (!penroseHasSegment(summary, first, second)) {
      addWarning(
        "penrose-chord-segment-missing",
        `The prompt refers to chord ${first}${second}, but Segment(..., ${first}, ${second}) is missing.`,
      );
    }
    if (!pointsSharePenroseCircle(summary, [first, second])) {
      addWarning("penrose-chord-circle-mismatch", `Chord ${first}${second} should have both endpoints on the same Penrose circle.`);
    }

    if (!parallelChordKeys.has(orderedPairKey(first, second))) continue;
    const parallelCalls = penroseCalls(summary, "ParallelToSegment").filter((call) => penrosePairMatches(call.args, first, second, 1));
    if (!parallelCalls.length) {
      addWarning(
        "penrose-circle-parallel-chord-missing",
        `The prompt says the tangent is parallel to chord ${first}${second}, but ParallelToSegment(line, ${first}, ${second}) is missing.`,
      );
    } else if (
      tangentCalls.length &&
      !parallelCalls.some((parallelCall) => tangentCalls.some((tangentCall) => tangentCall.args[0] === parallelCall.args[0]))
    ) {
      addWarning(
        "penrose-circle-parallel-line-mismatch",
        `The line marked parallel to chord ${first}${second} is not the same line used by the Tangent(...) predicate.`,
      );
    }
  }

  for (const [first, second] of equalitySegmentsFromText(questionText)) {
    if (!penroseHasSegment(summary, first, second)) {
      addWarning(
        "penrose-equality-segment-missing",
        `The prompt asks about ${first}${second}, but Segment(..., ${first}, ${second}) is missing.`,
      );
    }
  }

  return { checks, warnings };
}

export function inspectDiagramSemantics(graphConfig: GraphConfig, questionText: string): MauthDiagramSemanticInspection {
  if (graphConfig.type !== "geometricConstruction") return { checks: [], warnings: [] };
  const source = penroseSourceFromGraphConfig(graphConfig);
  if (!source.trim()) return { checks: ["penrose-source"], warnings: [] };
  const summary = parsePenroseSubstance(source);
  return penroseCircleGeometryWarnings(questionText, summary);
}
