import { test, expect } from "@playwright/test";
import { assessment, loadFixture } from "./fixtures.mjs";
import { renderGeometricConstructionDiagram } from "../../packages/diagram-penrose/src/index.mjs";

const advanced = {
  type: "geometricConstruction",
  style: "geometry",
  data: {},
  options: {
    substanceSource: "Point A",
    domainSource: "type Point",
    styleSource:
      'canvas {\n width = 100\n height = 100\n}\nforall Point p {\n p.dot = Circle {\n r: 20\n center: (0, 0)\n onclick: "alert(91)"\n }\n}\n',
  },
};

for (const type of ["geometricConstruction", "network", "setDiagram"]) {
  test(`Penrose ${type} strips active SVG after label presentation`, async ({ page }) => {
    const rendered = await renderGeometricConstructionDiagram(advanced);
    expect(rendered.svg).toContain('onclick="alert(91)"'); // Actual producer reproduction.
    const attacks = `<defs><path id="safe-glyph" d="M0 0L2 2"/><clipPath id="safe-clip"><rect width="10" height="10"/></clipPath></defs>
      <g clip-path="url(#safe-clip)" data-mauth-penrose-label="safe.labelText" data-label-offset-x="0" data-label-offset-y="0">
        <svg role="img" style="font-size: 8px"><use href="#safe-glyph"/></svg>
      </g>
      <g ONPOINTERENTER="alert(92)"><rect width="4" height="4"/></g>
      <script>alert(94)</script><style>@import url(https://example.invalid/svg-security-probe/css);</style>
      <image href="https://example.invalid/svg-security-probe/image"/>
      <a href="&#106;avascript:alert(95)"><text>bad link</text></a>
      <use href="data:image/svg+xml,bad"/><use xlink:href="javascript:alert(96)" xmlns:xlink="http://www.w3.org/1999/xlink"/>
      <rect fill="url(https://example.invalid/svg-security-probe/paint)" style="fill:url(https://example.invalid/svg-security-probe/style)"/>
      <rect fill="u\\72l(https://example.invalid/svg-security-probe/escaped)"/>
      <animate attributeName="href" to="javascript:alert(97)"/>
      <foreignObject><iframe srcdoc="&lt;script&gt;alert(93)&lt;/script&gt;"></iframe></foreignObject>`;
    const response = { ...rendered, svg: rendered.svg.replace("</svg>", `${attacks}</svg>`) };
    let dialogs = 0;
    const external = [];
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "beforeunload") return dialog.accept();
      dialogs += 1;
      await dialog.dismiss();
    });
    await page.route("https://example.invalid/**", async (route) => {
      external.push(route.request().url());
      await route.abort();
    });
    const draft = assessment(1);
    draft.questions[0].contentBlocks = [{ id: "security", kind: "diagram", graphConfig: { ...advanced, type } }];
    await loadFixture(page, draft);
    await page.route("**/api/diagram/penrose", (route) => route.fulfill({ json: response }));
    await page.getByRole("button", { name: "Retry diagram", exact: true }).first().click();
    const diagram = page.locator(".preview-pane .a4-page .penrose-diagram").filter({ visible: true }).first();
    await expect(diagram).toHaveAttribute("data-mauth-print-render-state", "ready");
    // The app adds its own cursor/touch styles to draggable label wrappers.
    await expect(
      diagram.locator("script, style, foreignObject, iframe, image, a, animate, [style]:not([data-mauth-penrose-label])"),
    ).toHaveCount(0);
    expect(
      await diagram.evaluate((root) =>
        [...root.querySelectorAll("*")]
          .flatMap((node) => [...node.attributes])
          .filter((attr) => /^on/i.test(attr.name) || /example\.invalid|javascript:|data:image|\\/.test(attr.value))
          .map((attr) => attr.name),
      ),
    ).toEqual([]);
    await diagram.locator("circle").first().click();
    await expect(diagram.locator('use[href="#safe-glyph"]')).toHaveCount(1);
    await expect(diagram.locator('[clip-path="url(#safe-clip)"]')).toHaveCount(1);
    await expect(diagram.locator('svg[font-size="8px"]')).toHaveCount(1);
    expect(dialogs).toBe(0);
    expect(external).toEqual([]);
    // Print uses the same already-sanitized DOM.
    await page.emulateMedia({ media: "print" });
    await expect(diagram.locator("[onclick], script, foreignObject")).toHaveCount(0);
  });
}
