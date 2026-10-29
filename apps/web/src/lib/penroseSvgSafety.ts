import createDOMPurify from "dompurify";

const fragment = /^#[A-Za-z0-9_.:-]+$/;
const localPaint = /^url\(\s*["']?#[A-Za-z0-9_.:-]+["']?\s*\)$/i;
const paintAttributes = new Set(["fill", "stroke", "filter", "clip-path", "mask", "marker-start", "marker-mid", "marker-end", "cursor"]);
const presentationProperties = [
  "font-size",
  "font-family",
  "font-style",
  "font-weight",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "visibility",
  "display",
  "vector-effect",
  "paint-order",
  "color",
];
let purifier: ReturnType<typeof createDOMPurify> | undefined;

/** Final boundary for generated SVG entering HTML. Never trust custom Penrose Style output. */
export function sanitizePenroseSvg(source: string): string {
  if (typeof window === "undefined") return "";
  if (!purifier) {
    purifier = createDOMPurify(window);
    purifier.addHook("uponSanitizeElement", (node) => {
      if (!(node instanceof window.SVGElement)) return;
      // MathJax uses inline font-size. Keep vetted presentation as SVG attributes,
      // then discard CSS entirely: no selectors, imports, escapes or URL loading.
      for (const property of presentationProperties) {
        const value = node.style.getPropertyValue(property).trim();
        if (value && (/^[#\w\s.,%+/'"-]+$/.test(value) || /^(?:rgb|hsl)a?\([\d\s,.%+/-]+\)$/i.test(value))) {
          node.setAttribute(property, value);
        }
      }
    });
    purifier.addHook("uponSanitizeAttribute", (node, data) => {
      const name = data.attrName.toLowerCase();
      if (name === "href" || name === "xlink:href") {
        data.keepAttr = node.nodeName.toLowerCase() === "use" && fragment.test(data.attrValue);
      } else if (paintAttributes.has(name)) {
        const value = data.attrValue;
        if ((/url\s*\(/i.test(value) && !localPaint.test(value)) || /[\\@]/.test(value)) data.keepAttr = false;
      }
    });
  }
  return purifier.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    FORBID_TAGS: ["style", "a", "image", "foreignObject", "animate", "animateMotion", "animateTransform", "set", "mpath"],
    FORBID_ATTR: ["style", "xml:base"],
  });
}
