import { Textarea } from "@/components/ui/textarea";

interface ContainerWordingEditorProps {
  label: string;
  value?: string;
  placeholder: string;
  minHeightClassName?: string;
  onChange: (value: string) => void;
}

export function ContainerWordingEditor({
  label,
  value,
  placeholder,
  minHeightClassName = "min-h-[74px]",
  onChange,
}: ContainerWordingEditorProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Textarea
        aria-label={label}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`font-mono ${minHeightClassName}`}
      />
    </label>
  );
}
