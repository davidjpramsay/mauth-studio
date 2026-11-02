// Fixed mathematical inputs shared by the regression suite and both engines.
function network(names, links) {
  return {
    type: "network",
    options: { scalePercent: 100 },
    data: {
      objects: names.map((name) => ({ type: "point", name, label: name })),
      relationships: links.map(([a, b, label, directed]) => ({
        type: directed ? "vectorSegment" : "segment",
        name: a + b,
        points: [a, b],
        label: String(label),
      })),
    },
  };
}
export const networkComparisonFixtures = {
  showcase: network(
    ["A", "B", "C", "D", "E"],
    [
      ["A", "B", 4],
      ["A", "C", 2],
      ["B", "C", 1],
      ["B", "D", 5],
      ["C", "D", 8],
      ["C", "E", 10],
      ["D", "E", 2],
    ],
  ),
  tree: network(
    ["A", "B", "C", "D", "E", "F"],
    [
      ["A", "B", 12],
      ["A", "C", 7],
      ["B", "D", 3],
      ["B", "E", 15],
      ["C", "F", 8],
    ],
  ),
  directedLoop: network(
    ["A", "B", "C", "D"],
    [
      ["A", "B", 4, true],
      ["A", "C", 2],
      ["B", "C", 1, true],
      ["C", "D", 9],
      ["A", "A", 7, true],
    ],
  ),
  nonplanar: network(
    ["A", "B", "C", "D", "E", "F"],
    ["A", "B", "C"].flatMap((a, i) => ["D", "E", "F"].map((b, j) => [a, b, i * 3 + j + 1])),
  ),
};
