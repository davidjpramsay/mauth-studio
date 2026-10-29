import { penroseLabelOffsets } from "../../shared/src/penroseLabels.ts";

// Presentation is applied after optimization. Stable Substance names identify labels;
// neither the solver state nor geometry transforms are changed by a label move.
// DOMParser/XMLSerializer are supplied by the browser or the Penrose runtime's JSDOM.
export function presentPenroseLabels(svg: string, offsets: unknown, aliases: Record<string, string> = {}) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const positions = penroseLabelOffsets(offsets);
  const labels: string[] = [];
  for (const title of document.querySelectorAll("title")) {
    const match = title.textContent?.match(/^`([A-Za-z][A-Za-z0-9_]*)`\.(labelText|text)$/);
    const shape = title.parentElement;
    if (!match || !shape) continue;
    // Invisible helper labels contain only MathJax spacing, not visible glyphs.
    if (!shape.querySelector("path, use, text")) continue;
    const sourceId = `${match[1]}.${match[2]}`;
    const id = aliases[sourceId] ?? shape.parentElement?.getAttribute("data-mauth-penrose-label") ?? sourceId;
    let wrapper: Element | null = shape.parentElement;
    if (wrapper?.getAttribute("data-mauth-penrose-label") !== id) {
      wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
      shape.parentNode?.insertBefore(wrapper, shape);
      wrapper.appendChild(shape);
    }
    const [x, y] = positions[id] ?? [0, 0];
    wrapper.setAttribute("data-mauth-penrose-label", id);
    wrapper.setAttribute("data-label-offset-x", String(x));
    wrapper.setAttribute("data-label-offset-y", String(y));
    wrapper.setAttribute("transform", `translate(${x}, ${y})`);
    labels.push(id);
  }
  return { svg: new XMLSerializer().serializeToString(document.documentElement), labels };
}
