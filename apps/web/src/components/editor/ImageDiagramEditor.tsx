import type { GraphConfig } from "@mauth-studio/shared";
import { ImagePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImageDiagramCanvas } from "@/components/diagrams/ImageDiagramCanvas";
import { ImageAnnotationsEditor } from "@/components/editor/ImageAnnotationsEditor";
import {
  DEFAULT_IMAGE_DIAGRAM,
  diagramImageDimensions,
  imageConfigForSolutionVisibility,
  imageDiagramData,
  imageNameFromFile,
} from "@/lib/diagramImage";

interface ImageDiagramEditorProps {
  config: GraphConfig;
  showSolutions: boolean;
  onChange: (patch: Partial<GraphConfig>) => void;
}

export function ImageDiagramEditor({ config, showSolutions, onChange }: ImageDiagramEditorProps) {
  const data = imageDiagramData(config);
  const visibleConfig = imageConfigForSolutionVisibility(config, showSolutions, "#1d4ed8");

  function uploadImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) return;

      const name = imageNameFromFile(file.name);
      const commitImage = (naturalWidth?: number, naturalHeight?: number) => {
        const dimensions = diagramImageDimensions(naturalWidth, naturalHeight);
        onChange({
          data: {
            src,
            name,
            alt: name,
            mimeType: file.type,
            naturalWidth,
            naturalHeight,
            annotations: [],
          },
          widthPx: dimensions.widthPx,
          heightPx: dimensions.heightPx,
          functions: [],
          features: [],
        });
      };

      const image = new Image();
      image.onload = () => commitImage(image.naturalWidth, image.naturalHeight);
      image.onerror = () => commitImage();
      image.src = src;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          data.src ? "flex flex-wrap justify-end gap-2" : "grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
        }
      >
        {!data.src ? (
          <div className="flex min-h-40 items-center justify-center rounded-md border bg-white p-3">
            <ImageDiagramCanvas graphConfig={visibleConfig} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 md:w-44 md:flex-col">
          <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
            <ImagePlus className="size-4" aria-hidden="true" />
            Upload image
            <input
              type="file"
              accept="image/*,.svg"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) uploadImage(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {data.src ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-center"
              onClick={() =>
                onChange({
                  data: DEFAULT_IMAGE_DIAGRAM.data,
                  widthPx: DEFAULT_IMAGE_DIAGRAM.widthPx,
                  heightPx: DEFAULT_IMAGE_DIAGRAM.heightPx,
                  functions: [],
                  features: [],
                })
              }
            >
              <Trash2 data-icon="inline-start" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {data.src ? <ImageAnnotationsEditor config={config} showSolutions={showSolutions} onChange={onChange} /> : null}
    </div>
  );
}
