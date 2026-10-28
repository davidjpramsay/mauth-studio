// Network-specific presentation and candidate ranking. Penrose still solves all
// geometry/constraints. Automatic label placement happens before teacher offsets;
// it never changes nodes, edges, Substance, or the document's saved content.
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segmentDistance(p, a, b) {
  const length2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / length2)) : 0;
  return distance(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}
export function segmentsCross(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < -1e-6 && cross(c, d, a) * cross(c, d, b) < -1e-6;
}
const boxAt = (p, w, h, padding = 0) => ({ x: p[0] - w / 2 - padding, y: p[1] - h / 2 - padding, w: w + padding * 2, h: h + padding * 2 });
export const boxesOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function segmentHitsBox(a, b, box) {
  // Slab clipping includes corner touches and collinear boundary segments.
  let low = 0,
    high = 1;
  for (const [axis, min, max] of [
    [0, box.x, box.x + box.w],
    [1, box.y, box.y + box.h],
  ]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const first = (min - a[axis]) / delta,
        second = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low > high) return false;
    }
  }
  return true;
}
const titleOf = (element) => [...element.children].find((child) => child.tagName.toLowerCase() === "title")?.textContent ?? "";
const named = (title) => title.match(/^`([^`]+)`\./)?.[1];
const number = (el, key) => Number(el.getAttribute(key));

export function networkStyle() {
  // Weights are labels, not physical edge lengths. These are soft layout goals;
  // mathematical and custom Style constraints are never weakened.
  return ["Segment", "VectorSegment"]
    .map(
      (predicate) => `
forall NamedSegment s; Point a; Point b where ${predicate}(s, a, b) {
  encourage equal(vdist(a.dot.center, b.dot.center), 130)
}`,
    )
    .join("\n");
}

export function arrangeNetworkLabels(svg, substance) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.documentElement;
  const nodes = new Map();
  const loops = [];
  const edges = [];
  const labels = [];
  for (const element of root.querySelectorAll("circle")) {
    const title = titleOf(element) || titleOf(element.parentElement);
    const circle = { id: named(title), p: [number(element, "cx"), number(element, "cy")], r: number(element, "r") };
    if (title.endsWith(".dot")) nodes.set(circle.id, circle);
    else loops.push(circle);
  }
  for (const element of root.querySelectorAll("line")) {
    const title = titleOf(element) || titleOf(element.parentElement);
    if (!/\.(segmentLine|vectorLine)$/.test(title)) continue;
    edges.push({ id: named(title), a: [number(element, "x1"), number(element, "y1")], b: [number(element, "x2"), number(element, "y2")] });
  }
  const owners = new Map();
  for (const match of substance.matchAll(/LabelsSegment\((\w+),\s*(\w+),\s*(\w+)\)/g)) {
    const a = nodes.get(match[2])?.p,
      b = nodes.get(match[3])?.p;
    if (a && b) owners.set(match[1], { a, b });
  }
  for (const match of substance.matchAll(/LabelsSelfLoop\((\w+),\s*(\w+)\)/g)) {
    const node = nodes.get(match[2]);
    if (node) owners.set(match[1], { loop: [node.p[0] + 12.727922, node.p[1] + 12.727922], r: 18 });
  }
  for (const element of root.querySelectorAll("g")) {
    const title = titleOf(element);
    if (!/\.(labelText|text)$/.test(title)) continue;
    const equation = [...element.children].find((child) => child.tagName.toLowerCase() === "svg");
    if (!equation?.querySelector("path, use, text")) continue;
    const translation = element.getAttribute("transform")?.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)/i);
    if (!translation) continue;
    const w = number(equation, "width"),
      h = number(equation, "height");
    const p = [Number(translation[1]) + w / 2, Number(translation[2]) + h / 2];
    const id = named(title);
    const escapedId = id?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const explicitPosition = escapedId && new RegExp(`\\bLabel(?:Above|Below|Left|Right)\\s*\\(\\s*${escapedId}\\s*\\)`).test(substance);
    labels.push({
      id,
      element,
      w,
      h,
      p,
      original: p,
      owner: explicitPosition ? undefined : title.endsWith(".labelText") ? { node: nodes.get(id)?.p } : owners.get(id),
    });
  }
  const arrowheads = [...root.querySelectorAll("polygon")].map((element) => {
    const values = (element.getAttribute("points") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const xs = values.filter((_, i) => i % 2 === 0),
      ys = values.filter((_, i) => i % 2 === 1);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  const allNodes = [...nodes.values()];
  const centroid = allNodes.length ? [0, 1].map((axis) => allNodes.reduce((sum, n) => sum + n.p[axis], 0) / allNodes.length) : [210, 150];
  function candidates(label) {
    const { owner, w, h } = label;
    if (owner?.a) {
      const { a, b } = owner;
      const length = distance(a, b) || 1;
      const normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      const clearance = (Math.abs(normal[0]) * w) / 2 + (Math.abs(normal[1]) * h) / 2;
      return [0.5, 0.4, 0.6, 0.3, 0.7].flatMap((t) =>
        [4, 8, 12].flatMap((gap) =>
          [1, -1].map((sign) => [
            a[0] + t * (b[0] - a[0]) + normal[0] * (clearance + gap) * sign,
            a[1] + t * (b[1] - a[1]) + normal[1] * (clearance + gap) * sign,
          ]),
        ),
      );
    }
    const anchor = owner?.node ?? owner?.loop;
    if (anchor) {
      const base = Math.atan2(anchor[1] - centroid[1], anchor[0] - centroid[0]);
      return [5, 10, 16].flatMap((gap) =>
        Array.from({ length: 16 }, (_, i) => {
          const angle = base + (i * Math.PI) / 8,
            dx = Math.cos(angle),
            dy = Math.sin(angle);
          const radius = (owner.loop ? owner.r : 3) + (Math.abs(dx) * w) / 2 + (Math.abs(dy) * h) / 2 + gap;
          return [anchor[0] + dx * radius, anchor[1] + dy * radius];
        }),
      );
    }
    return [label.original]; // Unknown advanced annotations remain authoritative.
  }
  function cost(label, p, others) {
    const box = boxAt(p, label.w, label.h, 2);
    let collisions = others.filter((other) => boxesOverlap(box, boxAt(other.p, other.w, other.h, 2))).length;
    collisions += allNodes.filter((node) => boxesOverlap(box, boxAt(node.p, node.r * 2, node.r * 2, 2))).length;
    collisions += edges.filter((edge) => segmentHitsBox(edge.a, edge.b, box)).length;
    collisions += arrowheads.filter((arrow) => boxesOverlap(box, arrow)).length;
    collisions += loops.filter((loop) => {
      const nearest = distance(loop.p, [
        Math.max(box.x, Math.min(loop.p[0], box.x + box.w)),
        Math.max(box.y, Math.min(loop.p[1], box.y + box.h)),
      ]);
      const farthest = Math.max(...[box.x, box.x + box.w].flatMap((x) => [box.y, box.y + box.h].map((y) => distance(loop.p, [x, y]))));
      return nearest < loop.r + 2 && farthest > loop.r - 2;
    }).length;
    const owner = label.owner;
    const anchor = owner?.a
      ? [(owner.a[0] + owner.b[0]) / 2, (owner.a[1] + owner.b[1]) / 2]
      : (owner?.node ?? owner?.loop ?? label.original);
    let ambiguity = 0;
    if (owner?.a) {
      const ownDistance = segmentDistance(p, owner.a, owner.b);
      ambiguity = edges.filter((edge) => {
        const ownEdge = segmentDistance(edge.a, owner.a, owner.b) < 1 && segmentDistance(edge.b, owner.a, owner.b) < 1;
        return !ownEdge && segmentDistance(p, edge.a, edge.b) < ownDistance + 2;
      }).length;
    }
    const outside = box.x < 2 || box.y < 2 || box.x + box.w > 418 || box.y + box.h > 298;
    return {
      collisions,
      ambiguity,
      outside,
      score: collisions * 100000 + Number(outside) * 100000 + ambiguity * 3000 + distance(p, anchor),
    };
  }
  // Coordinate descent lets later labels move earlier ones out of their way.
  // Stable order and finite candidates make every seed reproducible.
  for (let pass = 0; pass < 4; pass++) {
    for (const label of labels) {
      const others = labels.filter((other) => other !== label);
      const choices = candidates(label).map((p) => ({ p, ...cost(label, p, others) }));
      choices.sort((a, b) => a.score - b.score);
      label.p = choices[0].p;
    }
  }
  let collisions = 0,
    ambiguousWeights = 0,
    clippedLabels = 0;
  for (const label of labels) {
    const result = cost(
      label,
      label.p,
      labels.filter((other) => other !== label),
    );
    collisions += result.collisions;
    ambiguousWeights += result.ambiguity;
    clippedLabels += Number(result.outside);
    const [dx, dy] = [label.p[0] - label.original[0], label.p[1] - label.original[1]];
    // Keep the manual wrapper separate so reapplying teacher offsets in the web
    // renderer cannot erase this automatic base position.
    const transform = label.element.getAttribute("transform") ?? "";
    label.element.setAttribute("transform", `translate(${dx}, ${dy}) ${transform}`);
  }
  let crossings = 0,
    nodeEdgeObstructions = 0;
  edges.forEach((edge, i) => {
    for (const other of edges.slice(i + 1)) if (segmentsCross(edge.a, edge.b, other.a, other.b)) crossings++;
    for (const node of allNodes) {
      if (distance(node.p, edge.a) < 20 || distance(node.p, edge.b) < 20) continue;
      if (segmentDistance(node.p, edge.a, edge.b) < 12) nodeEdgeObstructions++;
    }
  });
  const crop = root.querySelector("croppedViewBox");
  if (crop && labels.length) {
    const [x, y, w, h] = crop.textContent.trim().split(/\s+/).map(Number);
    const minX = Math.min(x, ...labels.map((l) => l.p[0] - l.w / 2 - 2));
    const minY = Math.min(y, ...labels.map((l) => l.p[1] - l.h / 2 - 2));
    const maxX = Math.max(x + w, ...labels.map((l) => l.p[0] + l.w / 2 + 2));
    const maxY = Math.max(y + h, ...labels.map((l) => l.p[1] + l.h / 2 + 2));
    crop.textContent = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }
  const quality = {
    scope: "automaticNetworkLayout",
    crossings,
    nodeEdgeObstructions,
    labelCollisions: collisions,
    ambiguousWeights,
    clippedLabels,
  };
  return {
    svg: new XMLSerializer().serializeToString(root),
    quality,
    score: (collisions + clippedLabels) * 100000 + nodeEdgeObstructions * 20000 + crossings * 10000 + ambiguousWeights * 3000,
  };
}
