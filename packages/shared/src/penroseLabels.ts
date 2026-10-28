export type PenroseLabelOffsets = Record<string, [number, number]>;
export const PENROSE_LABEL_ID = /^[A-Za-z][A-Za-z0-9_]*\.(?:labelText|text)$/;

// Assign identities before answer filtering. Renderer-generated sideLabel1 etc.
// are positional and cannot safely identify a shared label in both copies.
export function penroseRelationshipsWithLabelIds(relationships: unknown) {
  const counts = new Map<string, number>();
  return (Array.isArray(relationships) ? relationships : []).map((entry: Record<string, unknown>) => {
    if (!entry || typeof entry !== "object") return entry;
    if (typeof entry._mauthLabelId === "string" && PENROSE_LABEL_ID.test(entry._mauthLabelId)) return entry;
    const points = entry.points ?? entry.between ?? [entry.a, entry.at ?? entry.b, entry.c];
    const identity = String(entry.id ?? entry.name ?? `${entry.type}_${Array.isArray(points) ? points.filter(Boolean).join("_") : ""}`);
    const safe = /^[A-Za-z][A-Za-z0-9_]*$/.test(identity)
      ? identity
      : `encoded_${[...identity].map((c) => c.codePointAt(0)!.toString(16)).join("_")}`;
    const count = (counts.get(safe) ?? 0) + 1;
    counts.set(safe, count);
    return { ...entry, _mauthLabelId: `relationship_${safe}${count > 1 ? `_copy${count}` : ""}.text` };
  });
}

export function penroseLabelOffsets(value: unknown): PenroseLabelOffsets {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PenroseLabelOffsets = {};
  for (const [id, offset] of Object.entries(value)) {
    if (
      PENROSE_LABEL_ID.test(id) &&
      Array.isArray(offset) &&
      offset.length === 2 &&
      offset.every((number) => typeof number === "number" && Number.isFinite(number))
    )
      result[id] = [offset[0], offset[1]];
  }
  return result;
}
