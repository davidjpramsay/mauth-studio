import { Latex } from "@/components/Latex";
import {
  DELIMITED_MATH_PATTERN,
  DISPLAY_MATH_BLOCK_PATTERN,
  MIXED_MATH_LINE_PATTERN,
  unescapeTextMathDelimiters,
} from "@/lib/mathDelimiters";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useMemo } from "react";

const SOLUTION_MARK_SYMBOL = "✓";
const SOLUTION_MARK_ANNOTATION_PATTERN = /\s*\[\[marks:(\d+)]]\s*$/i;
type MixedMathSegmentType = "text" | "inline" | "display" | "marked-text" | "marked-display";
type MixedMathSegment = { type: MixedMathSegmentType; content: string; marks?: number };

function stripMathDelimiters(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return trimmed.slice(2, -2).trim();
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function looksLikeBareMath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\\[A-Za-z]+|[_^{}=<>]|[∑∫√π≤≥∞]/.test(trimmed)) return true;
  if (/^[A-Za-z]$/.test(trimmed)) return true;
  return /^[A-Za-z]\([^)]*[=+\-*/^<>][^)]*\)$/.test(trimmed);
}

export function mathTextHasMath(source?: string | null) {
  const text = source?.trim() ?? "";
  DELIMITED_MATH_PATTERN.lastIndex = 0;
  return Boolean(text && (DELIMITED_MATH_PATTERN.test(text) || looksLikeBareMath(stripMathDelimiters(text))));
}

export function MathText({ source, className }: { source?: string | null; className?: string }) {
  const text = source ?? "";
  if (!text) return null;

  DELIMITED_MATH_PATTERN.lastIndex = 0;
  const matches = Array.from(text.matchAll(DELIMITED_MATH_PATTERN));
  if (!matches.length) {
    return (
      <span className={cn("inline-flex items-center whitespace-nowrap align-middle", className)}>
        {looksLikeBareMath(text) ? <Latex latex={stripMathDelimiters(text)} /> : unescapeTextMathDelimiters(text)}
      </span>
    );
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const token = match[0];
    if (start > cursor) {
      parts.push(<span key={`text-${index}`}>{unescapeTextMathDelimiters(text.slice(cursor, start))}</span>);
    }
    parts.push(<Latex key={`math-${index}`} latex={stripMathDelimiters(token)} />);
    cursor = start + token.length;
  });
  if (cursor < text.length) {
    parts.push(<span key="text-end">{unescapeTextMathDelimiters(text.slice(cursor))}</span>);
  }

  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap align-middle", className)}>{parts}</span>;
}

function renderInlineFormatting(text: string): ReactNode[] {
  return unescapeTextMathDelimiters(text)
    .split(/(\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g)
    .map((segment, index) => {
      const key = `${segment}-${index}`;
      if (segment.startsWith("***") && segment.endsWith("***")) {
        return (
          <strong key={key}>
            <em>{segment.slice(3, -3)}</em>
          </strong>
        );
      }
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return <strong key={key}>{segment.slice(2, -2)}</strong>;
      }
      if (segment.startsWith("*") && segment.endsWith("*")) {
        return <em key={key}>{segment.slice(1, -1)}</em>;
      }
      return <span key={key}>{segment}</span>;
    });
}

export function FormattedText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {paragraphs.map((paragraph, index) => (
        <div key={`${paragraph}-${index}`} className="m-0">
          <MixedMath source={paragraph} />
        </div>
      ))}
    </div>
  );
}

function FormattedInlineText({ text }: { text: string }) {
  return <>{renderInlineFormatting(text)}</>;
}

function extractSolutionMarkAnnotation(source: string) {
  const match = source.match(SOLUTION_MARK_ANNOTATION_PATTERN);
  if (!match) return { source, marks: 0 };
  const marks = Math.max(0, Math.min(6, Math.round(Number(match[1]) || 0)));
  return { source: source.slice(0, match.index).trimEnd(), marks };
}

function isDisplayMathLine(source: string) {
  const trimmed = source.trim();
  return trimmed.startsWith("$$") && trimmed.endsWith("$$");
}

function parseMixedMathLine(source: string) {
  const segments: MixedMathSegment[] = [];
  const regex = new RegExp(MIXED_MATH_LINE_PATTERN);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > cursor) {
      const extracted = extractSolutionMarkAnnotation(source.slice(cursor, match.index));
      if (extracted.source || extracted.marks) segments.push({ type: "text", content: extracted.source, marks: extracted.marks });
    }
    const extractedToken = extractSolutionMarkAnnotation(match[0]);
    const token = extractedToken.source;
    segments.push(
      token.startsWith("$$")
        ? { type: "display", content: token.slice(2, -2).trim(), marks: extractedToken.marks }
        : { type: "inline", content: token.slice(1, -1).trim(), marks: extractedToken.marks },
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    const extracted = extractSolutionMarkAnnotation(source.slice(cursor));
    if (extracted.source || extracted.marks) segments.push({ type: "text", content: extracted.source, marks: extracted.marks });
  }
  return segments;
}

const MIXED_MATH_PARSE_CACHE_LIMIT = 1500;
const mixedMathParseCache = new Map<string, MixedMathSegment[]>();

function getCachedMixedMathSegments(source: string) {
  const cached = mixedMathParseCache.get(source);
  if (!cached) return undefined;

  mixedMathParseCache.delete(source);
  mixedMathParseCache.set(source, cached);
  return cached;
}

function setCachedMixedMathSegments(source: string, segments: MixedMathSegment[]) {
  if (mixedMathParseCache.size >= MIXED_MATH_PARSE_CACHE_LIMIT) {
    const oldestKey = mixedMathParseCache.keys().next().value;
    if (oldestKey) mixedMathParseCache.delete(oldestKey);
  }

  mixedMathParseCache.set(source, segments);
}

function parseMixedMathText(source: string) {
  const segments: MixedMathSegment[] = [];
  const lines = source.split(/(\n)/);

  for (const line of lines) {
    if (line === "\n") {
      segments.push({ type: "text", content: line });
      continue;
    }

    const extractedLine = extractSolutionMarkAnnotation(line);
    if (extractedLine.marks) {
      const content = extractedLine.source;
      if (isDisplayMathLine(content)) {
        const trimmed = content.trim();
        segments.push({ type: "marked-display", content: trimmed.slice(2, -2).trim(), marks: extractedLine.marks });
      } else {
        segments.push({ type: "marked-text", content, marks: extractedLine.marks });
      }
      continue;
    }

    segments.push(...parseMixedMathLine(line));
  }

  return segments;
}

function parseMixedMathUncached(source: string) {
  const segments: MixedMathSegment[] = [];
  const displayRegex = new RegExp(DISPLAY_MATH_BLOCK_PATTERN);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = displayRegex.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push(...parseMixedMathText(source.slice(cursor, match.index)));
    }

    const extractedToken = extractSolutionMarkAnnotation(match[0]);
    segments.push({
      type: extractedToken.marks ? "marked-display" : "display",
      content: extractedToken.source.slice(2, -2).trim(),
      marks: extractedToken.marks,
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    segments.push(...parseMixedMathText(source.slice(cursor)));
  }

  return segments;
}

export function parseMixedMath(source: string) {
  const cached = getCachedMixedMathSegments(source);
  if (cached) return cached;

  const segments = parseMixedMathUncached(source);
  setCachedMixedMathSegments(source, segments);
  return segments;
}

export function SolutionMarkTicks({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="solution-mark-ticks" aria-label={`${count} solution ${count === 1 ? "mark" : "marks"}`}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index}>{SOLUTION_MARK_SYMBOL}</span>
      ))}
    </span>
  );
}

function compactSolutionTextSegment(
  content: string,
  previousType?: "text" | "inline" | "display",
  nextType?: "text" | "inline" | "display",
) {
  let compacted = content.replace(/\n{3,}/g, "\n\n");

  if (previousType === "display") compacted = compacted.replace(/^\s*\n+\s*/g, "");
  if (nextType === "display") compacted = compacted.replace(/\s*\n+\s*$/g, "");

  return compacted.replace(/\n{2,}/g, "\n");
}

function compactDisplayBoundaryTextSegment(
  content: string,
  previousType?: "text" | "inline" | "display",
  nextType?: "text" | "inline" | "display",
) {
  let compacted = content;

  if (previousType === "display") compacted = compacted.replace(/^[\t ]*\r?\n[\t ]*/, "");
  if (nextType === "display") compacted = compacted.replace(/[\t ]*\r?\n[\t ]*$/, "");

  return compacted;
}

function mixedMathLayoutType(type?: MixedMathSegmentType): "text" | "inline" | "display" | undefined {
  if (!type) return undefined;
  if (type === "marked-display") return "display";
  if (type === "marked-text") return "text";
  return type;
}

export function MixedMath({
  source,
  showSolutionMarks = false,
  plainSimpleInlineLatex = true,
}: {
  source: string;
  showSolutionMarks?: boolean;
  plainSimpleInlineLatex?: boolean;
}) {
  const segments = useMemo(() => parseMixedMath(source), [source]);
  return (
    <div className="mixed-math">
      {segments.map((segment, index) => {
        const previousType = mixedMathLayoutType(segments[index - 1]?.type);
        const nextType = mixedMathLayoutType(segments[index + 1]?.type);
        const marks = showSolutionMarks ? segment.marks : 0;
        if (segment.type === "display" || segment.type === "marked-display") {
          const displayMath = (
            <div className="test-display-math">
              <Latex latex={segment.content} block />
            </div>
          );
          if (marks) {
            return (
              <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-display">
                {displayMath}
                <SolutionMarkTicks count={marks} />
              </div>
            );
          }
          return (
            <div key={`${segment.content}-${index}`} className="test-display-math">
              <Latex latex={segment.content} block />
            </div>
          );
        }
        if (segment.type === "marked-text") {
          const textContent = showSolutionMarks
            ? compactSolutionTextSegment(segment.content, previousType, nextType)
            : compactDisplayBoundaryTextSegment(segment.content, previousType, nextType);
          if (showSolutionMarks && !textContent.trim()) return null;
          if (marks) {
            return (
              <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-text">
                <span>
                  <InlineMathText source={textContent} />
                </span>
                <SolutionMarkTicks count={marks} />
              </div>
            );
          }
          return <InlineMathText key={`${segment.content}-${index}`} source={textContent} />;
        }
        if (segment.type === "inline") {
          const inlineMath = <Latex latex={segment.content} plainSimpleInlineLatex={plainSimpleInlineLatex} />;
          if (marks) {
            return (
              <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-text">
                <span>{inlineMath}</span>
                <SolutionMarkTicks count={marks} />
              </div>
            );
          }
          return <span key={`${segment.content}-${index}`}>{inlineMath}</span>;
        }
        const textContent = showSolutionMarks
          ? compactSolutionTextSegment(segment.content, previousType, nextType)
          : compactDisplayBoundaryTextSegment(segment.content, previousType, nextType);
        if (showSolutionMarks && !textContent.trim()) {
          if (textContent.includes("\n")) return <span key={`${segment.content}-${index}`}>{textContent}</span>;
          return null;
        }
        if (marks) {
          return (
            <div key={`${segment.content}-${index}`} className="test-marked-line test-marked-text">
              <span>
                <FormattedInlineText text={textContent} />
              </span>
              <SolutionMarkTicks count={marks} />
            </div>
          );
        }
        return <FormattedInlineText key={`${segment.content}-${index}`} text={textContent} />;
      })}
    </div>
  );
}

function InlineMathText({ source, className, truncate = false }: { source: string; className?: string; truncate?: boolean }) {
  const segments = useMemo(() => parseMixedMath(source), [source]);
  return (
    <span className={cn(truncate ? "inline-math-truncate" : "inline min-w-0", className)} title={source}>
      {segments.map((segment, index) => {
        if (segment.type === "text" || segment.type === "marked-text") {
          return <FormattedInlineText key={`${segment.content}-${index}`} text={segment.content} />;
        }
        return <Latex key={`${segment.content}-${index}`} latex={segment.content} />;
      })}
    </span>
  );
}

export function FrontMatterInlineText({ text, className }: { text: string; className?: string }) {
  return <InlineMathText source={text} className={className} />;
}

export function InlineSummaryTitle({ label, summary }: { label: ReactNode; summary?: string }) {
  const trimmedSummary = summary?.trim();

  if (!trimmedSummary) return <>{label}</>;

  return (
    <span className="flex w-full min-w-0 max-w-full items-baseline gap-1">
      <span className="shrink-0">{label}:</span>
      <span className="min-w-0 flex-1 font-normal text-muted-foreground">
        <InlineMathText source={trimmedSummary} truncate />
      </span>
    </span>
  );
}
