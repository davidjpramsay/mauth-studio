import { Latex } from "@/components/Latex";
import { DELIMITED_MATH_PATTERN, unescapeTextMathDelimiters } from "@/lib/mathDelimiters";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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
