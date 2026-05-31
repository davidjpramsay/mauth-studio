import type { GraphConfig } from "@mauth-studio/shared";
import { PlusCircle, Trash2 } from "lucide-react";

import { CollapsiblePanel } from "@/components/editor/EditorPanels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PENROSE_SCALE_PERCENT, penroseOptions, penroseScalePercent, removePenroseSubstanceOverride } from "@/lib/diagramPenrose";
import { DEFAULT_NETWORK_DATA, normalizedNetworkDiagramData, penroseIdentifier, networkDataForSave } from "@/lib/diagramNetwork";

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function numberInputValue(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

type NetworkDiagramEditorProps = {
  config: GraphConfig;
  substanceSource: string;
  settingsMode?: "inline" | "inspector";
  onChange: (patch: Partial<GraphConfig>) => void;
};

export function NetworkDiagramEditor({ config, substanceSource, settingsMode = "inline", onChange }: NetworkDiagramEditorProps) {
  const scalePercent = penroseScalePercent(config);
  const data = normalizedNetworkDiagramData(config);
  const hasSubstanceOverride = typeof config.options?.substanceSource === "string" && config.options.substanceSource.trim().length > 0;
  const showInlineSettings = settingsMode === "inline";
  const patchNetworkData = (nextData: ReturnType<typeof normalizedNetworkDiagramData>) => {
    onChange({
      data: networkDataForSave(nextData),
      options: removePenroseSubstanceOverride(config),
      widthPx: undefined,
      heightPx: undefined,
    });
  };
  const updateScale = (value: number) =>
    onChange({
      scalePercent: value,
      options: { ...penroseOptions(config), scalePercent: value },
      widthPx: undefined,
      heightPx: undefined,
    });
  const updateVisibility = (patch: Partial<Pick<ReturnType<typeof normalizedNetworkDiagramData>, "hidePoints" | "hidePointLabels">>) => {
    patchNetworkData({ ...data, ...patch });
  };
  const updateNode = (nodeIndex: number, patch: Partial<(typeof data)["objects"][number]>) => {
    patchNetworkData({
      ...data,
      objects: data.objects.map((node, index) => {
        if (index !== nodeIndex) return node;
        const nextName = patch.name ? penroseIdentifier(patch.name, node.name) : node.name;
        return { ...node, ...patch, name: nextName, label: patch.label ?? node.label ?? nextName };
      }),
      relationships: data.relationships.map((relationship) => ({
        ...relationship,
        points: relationship.points.map((point) => {
          const currentNode = data.objects[nodeIndex];
          const nextName = patch.name ? penroseIdentifier(patch.name, currentNode.name) : currentNode.name;
          return point === currentNode.name ? nextName : point;
        }),
      })),
    });
  };
  const addNode = () => {
    const nextIndex = data.objects.length + 1;
    const name = penroseIdentifier(String.fromCharCode(64 + Math.min(nextIndex, 26)), `N${nextIndex}`);
    patchNetworkData({
      ...data,
      objects: [...data.objects, { type: "point", name, label: name }],
    });
  };
  const removeNode = (nodeIndex: number) => {
    const node = data.objects[nodeIndex];
    if (!node || data.objects.length <= 1) return;
    patchNetworkData({
      ...data,
      objects: data.objects.filter((_, index) => index !== nodeIndex),
      relationships: data.relationships.filter((relationship) => !relationship.points.includes(node.name)),
    });
  };
  const updateRelationship = (relationshipIndex: number, patch: Partial<(typeof data)["relationships"][number]>) => {
    patchNetworkData({
      ...data,
      relationships: data.relationships.map((relationship, index) =>
        index === relationshipIndex ? { ...relationship, ...patch } : relationship,
      ),
    });
  };
  const addRelationship = () => {
    const pointNames = data.objects.map((object) => object.name);
    const start = pointNames[0] ?? "A";
    const end = pointNames[1] ?? "B";
    patchNetworkData({
      ...data,
      relationships: [
        ...data.relationships,
        {
          type: "vectorSegment",
          name: penroseIdentifier(`${start}${end}${data.relationships.length + 1}`, `v${data.relationships.length + 1}`),
          points: [start, end],
          label: "",
        },
      ],
    });
  };
  const removeRelationship = (relationshipIndex: number) => {
    patchNetworkData({
      ...data,
      relationships: data.relationships.filter((_, index) => index !== relationshipIndex),
    });
  };
  const useNetworkPreset = () => {
    patchNetworkData({
      hidePoints: false,
      hidePointLabels: false,
      objects: DEFAULT_NETWORK_DATA.objects.map((object) => ({ ...object, label: object.name })),
      relationships: DEFAULT_NETWORK_DATA.relationships.map((relationship) => ({ ...relationship })),
    });
  };
  const updateSubstance = (value: string) =>
    onChange({
      options: { ...penroseOptions(config), substanceSource: value },
      widthPx: undefined,
      heightPx: undefined,
    });

  return (
    <div className="flex flex-col gap-4">
      {showInlineSettings ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-36 flex-col gap-2 text-xs font-medium">
            Diagram scale
            <input
              type="number"
              min={25}
              max={250}
              step={5}
              value={numberInputValue(scalePercent)}
              onChange={(event) => updateScale(optionalNumber(event.target.value) ?? DEFAULT_PENROSE_SCALE_PERCENT)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            />
          </label>
          <Button type="button" variant="outline" className="self-end" onClick={() => updateScale(DEFAULT_PENROSE_SCALE_PERCENT)}>
            Original
          </Button>
          <Button type="button" variant="outline" className="self-end" onClick={useNetworkPreset}>
            Network preset
          </Button>
        </div>
      ) : null}

      {hasSubstanceOverride ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This network diagram has custom Substance. Changing the controls below will clear that Substance override and return to structured
          network data.
        </div>
      ) : null}

      {showInlineSettings ? (
        <section className="flex flex-wrap gap-4 border-t pt-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!data.hidePoints}
              onChange={(event) => updateVisibility({ hidePoints: !event.target.checked })}
            />
            Show node dots
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!data.hidePointLabels}
              onChange={(event) => updateVisibility({ hidePointLabels: !event.target.checked })}
            />
            Show node labels
          </label>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nodes</div>
          <Button type="button" variant="outline" size="sm" onClick={addNode}>
            <PlusCircle data-icon="inline-start" />
            Add node
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {data.objects.map((node, nodeIndex) => (
            <div
              key={`${node.name}-${nodeIndex}`}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[110px_minmax(0,1fr)_40px] md:items-end"
            >
              <label className="flex flex-col gap-2 text-xs font-medium">
                Node
                <input
                  value={node.name}
                  onChange={(event) => updateNode(nodeIndex, { name: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 font-mono text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label
                <input
                  value={String(node.label ?? "")}
                  onChange={(event) => updateNode(nodeIndex, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Remove node"
                aria-label="Remove node"
                onClick={() => removeNode(nodeIndex)}
                className="size-9"
                disabled={data.objects.length <= 1}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links</div>
          <Button type="button" variant="outline" size="sm" onClick={addRelationship}>
            <PlusCircle data-icon="inline-start" />
            Add link
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {data.relationships.map((relationship, relationshipIndex) => (
            <div
              key={`${relationship.name}-${relationshipIndex}`}
              className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[140px_90px_90px_minmax(0,1fr)_40px] md:items-end"
            >
              <label className="flex flex-col gap-2 text-xs font-medium">
                Type
                <select
                  value={relationship.type}
                  onChange={(event) =>
                    updateRelationship(relationshipIndex, { type: event.target.value === "segment" ? "segment" : "vectorSegment" })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  <option value="vectorSegment">Directed arrow</option>
                  <option value="segment">Undirected line</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                From
                <select
                  value={relationship.points[0] ?? ""}
                  onChange={(event) =>
                    updateRelationship(relationshipIndex, {
                      points: [penroseIdentifier(event.target.value, "O"), relationship.points[1] ?? "A"],
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  {data.objects.map((node) => (
                    <option key={node.name} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                To
                <select
                  value={relationship.points[1] ?? ""}
                  onChange={(event) =>
                    updateRelationship(relationshipIndex, {
                      points: [relationship.points[0] ?? "O", penroseIdentifier(event.target.value, "A")],
                    })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                >
                  {data.objects.map((node) => (
                    <option key={node.name} value={node.name}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Label
                <input
                  value={String(relationship.label ?? "")}
                  onChange={(event) => updateRelationship(relationshipIndex, { label: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Remove link"
                aria-label="Remove link"
                onClick={() => removeRelationship(relationshipIndex)}
                className="size-9"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <CollapsiblePanel title="Advanced Substance" defaultOpen={false} className="bg-muted/20">
        <label className="flex flex-col gap-2 text-xs font-medium">
          Substance
          <Textarea
            key={`vector-substance-${substanceSource}`}
            defaultValue={substanceSource}
            className="min-h-40 font-mono text-xs"
            spellCheck={false}
            onBlur={(event) => updateSubstance(event.currentTarget.value)}
          />
        </label>
      </CollapsiblePanel>
    </div>
  );
}
