import type { ReactNode } from "react";
import type { ChoiceListLayout, ChoiceNumberingStyle, ContentBlock } from "@mauth-studio/shared";

import { ChoiceSolutionAnswerSelect } from "@/components/solutions/ChoiceSolutionAnswerSelect";
import { Textarea } from "@/components/ui/textarea";
import { normalizeChoiceItems, normalizeChoiceListLayout, normalizeChoiceNumberingStyle } from "@/lib/contentBlockNormalization";
import { contentBlockDisplayVisibility } from "@/lib/moduleSettingsPatches";
import { cn } from "@/lib/utils";
import { CollapsiblePanel, RemoveActionButton } from "./EditorPanels";

type ChoiceListBlock = Extract<ContentBlock, { kind: "choices" }>;

interface ChoiceListBlockEditorProps {
  label: string;
  title: ReactNode;
  block: ChoiceListBlock;
  numberingStyleOptions: Array<{ value: ChoiceNumberingStyle; label: string }>;
  layoutOptions: Array<{ value: ChoiceListLayout; label: string }>;
  showSolutions?: boolean;
  settingsMode?: "inline" | "inspector";
  dragHandle?: ReactNode;
  muted?: boolean;
  active?: boolean;
  openSignal?: number;
  onChange: (patch: Partial<ChoiceListBlock>) => void;
  onRemove: () => void;
}

function choiceItemsText(choices: string[]) {
  return normalizeChoiceItems(choices).join("\n");
}

function parseChoiceItemsText(value: string) {
  const choices = value.split(/\r?\n/).map((choice) => choice.trimEnd());
  return choices.length ? choices : [""];
}

export function ChoiceListBlockEditor({
  label,
  title,
  block,
  numberingStyleOptions,
  layoutOptions,
  showSolutions = false,
  settingsMode = "inline",
  dragHandle,
  muted = false,
  active = false,
  openSignal,
  onChange,
  onRemove,
}: ChoiceListBlockEditorProps) {
  const showInlineSettings = settingsMode === "inline";

  return (
    <CollapsiblePanel
      title={title}
      leading={dragHandle}
      actions={<RemoveActionButton label={`Remove ${label}`} onRemove={onRemove} />}
      className={cn("bg-background", muted && "bg-muted/30")}
      bodyClassName="p-3"
      active={active}
      openSignal={openSignal}
    >
      <div className={cn("grid grid-cols-1 gap-3", showInlineSettings && "md:grid-cols-[160px_minmax(0,1fr)]")}>
        {showInlineSettings ? (
          <>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Labels
              <select
                value={normalizeChoiceNumberingStyle(block.numberingStyle)}
                onChange={(event) => onChange({ numberingStyle: event.target.value as ChoiceNumberingStyle })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {numberingStyleOptions.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Layout
              <select
                value={normalizeChoiceListLayout(block.layout)}
                onChange={(event) => onChange({ layout: event.target.value as ChoiceListLayout })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              >
                {layoutOptions.map((layout) => (
                  <option key={layout.value} value={layout.value}>
                    {layout.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label className={cn("flex flex-col gap-2 text-xs font-medium", showInlineSettings && "md:row-span-2")}>
          Choices
          <Textarea
            aria-label={`${label} choices`}
            value={choiceItemsText(block.choices)}
            onChange={(event) => onChange({ choices: parseChoiceItemsText(event.target.value) })}
            className="min-h-[110px] font-mono"
          />
        </label>
        {showSolutions && contentBlockDisplayVisibility(block) !== "student" ? (
          <ChoiceSolutionAnswerSelect
            block={block}
            ariaLabel={`${label} circled answer`}
            className={cn(showInlineSettings && "md:col-span-2")}
            onChange={onChange}
          />
        ) : null}
      </div>
    </CollapsiblePanel>
  );
}
