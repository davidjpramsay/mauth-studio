import { useId } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GraphConfig, ImageDiagramAnnotation } from "@mauth-studio/shared";

import { MathText } from "@/components/MathText";
import { graphHeight, graphWidth } from "@/lib/diagramGraph2d";
import { imageDiagramAlt, imageDiagramData } from "@/lib/diagramImage";
import { cn } from "@/lib/utils";

interface ImageDiagramCanvasProps {
  graphConfig: GraphConfig;
  className?: string;
  selectedAnnotationId?: string;
  onAnnotationSelect?: (annotation: ImageDiagramAnnotation) => void;
}

function markerId(prefix: string, annotation: ImageDiagramAnnotation, index: number) {
  return `${prefix}-${annotation.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${index}`;
}

export function ImageDiagramCanvas({ graphConfig, className, selectedAnnotationId, onAnnotationSelect }: ImageDiagramCanvasProps) {
  const markerPrefix = useId().replace(/:/g, "");
  const data = imageDiagramData(graphConfig);
  const annotations = (data.annotations ?? []).filter((annotation) => annotation.show !== false);
  const widthPx = graphWidth(graphConfig);
  const heightPx = graphHeight(graphConfig);
  const interactive = Boolean(onAnnotationSelect);

  if (!data.src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-xs text-slate-500",
          className,
        )}
        style={{ width: widthPx, maxWidth: "100%", aspectRatio: `${widthPx} / ${heightPx}` }}
      >
        No image selected
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-white", className)}
      style={{ width: widthPx, maxWidth: "100%", aspectRatio: `${widthPx} / ${heightPx}` }}
    >
      <img className="absolute inset-0 size-full object-contain" src={data.src} alt={imageDiagramAlt(graphConfig)} />
      <svg
        className={cn("absolute inset-0 size-full overflow-visible", !interactive && "pointer-events-none")}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          {annotations.map((annotation, index) =>
            annotation.kind === "arrow" ? (
              <marker
                key={markerId(markerPrefix, annotation, index)}
                id={markerId(markerPrefix, annotation, index)}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill={annotation.color} />
              </marker>
            ) : null,
          )}
        </defs>
        {annotations.map((annotation, index) => {
          const selected = annotation.id === selectedAnnotationId;
          const common = {
            "data-image-annotation-id": annotation.id,
            stroke: annotation.color,
            strokeWidth: selected ? Math.max(3, annotation.strokeWidth ?? 2) : (annotation.strokeWidth ?? 2),
            vectorEffect: "non-scaling-stroke" as const,
            className: interactive ? "cursor-pointer" : undefined,
            onPointerDown: interactive
              ? (event: ReactPointerEvent<SVGElement>) => {
                  event.stopPropagation();
                  onAnnotationSelect?.(annotation);
                }
              : undefined,
          };
          if (annotation.kind === "ellipse") {
            return (
              <ellipse
                key={annotation.id}
                {...common}
                cx={annotation.xPercent}
                cy={annotation.yPercent}
                rx={(annotation.widthPercent ?? 20) / 2}
                ry={(annotation.heightPercent ?? 15) / 2}
                fill="none"
              />
            );
          }
          if (annotation.kind === "arrow") {
            return (
              <line
                key={annotation.id}
                {...common}
                x1={annotation.xPercent}
                y1={annotation.yPercent}
                x2={annotation.endXPercent ?? 70}
                y2={annotation.endYPercent ?? 30}
                markerEnd={`url(#${markerId(markerPrefix, annotation, index)})`}
              />
            );
          }
          return null;
        })}
      </svg>
      {annotations.map((annotation) =>
        annotation.kind === "label" && annotation.text?.trim() ? (
          <span
            key={annotation.id}
            data-image-annotation-id={annotation.id}
            tabIndex={interactive ? 0 : -1}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? `Select image annotation ${annotation.text}` : undefined}
            onClick={interactive ? () => onAnnotationSelect?.(annotation) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") onAnnotationSelect?.(annotation);
                  }
                : undefined
            }
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 border-0 bg-white/90 px-1 py-0.5 leading-none",
              interactive ? "cursor-pointer" : "pointer-events-none",
              annotation.id === selectedAnnotationId && "ring-2 ring-blue-500 ring-offset-1",
            )}
            style={{
              left: `${annotation.xPercent}%`,
              top: `${annotation.yPercent}%`,
              color: annotation.color,
              fontSize: `${annotation.fontSizePx ?? 16}px`,
            }}
          >
            <MathText source={annotation.text} className="leading-none" />
          </span>
        ) : null,
      )}
    </div>
  );
}
