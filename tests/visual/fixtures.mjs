export function assessment(count = 2) {
  return {
    frontMatter: { titlePageTemplate: "worksheet", subjectTitle: "MATHEMATICS", assessmentTitle: "Rendering reference" },
    formattingConfig: { id: "worksheet" },
    documentOpen: true,
    questions: Array.from({ length: count }, (_, index) => ({
      id: `q${index + 1}`,
      text: `Question content ${index + 1}: convert $\\frac{7\\pi}{12}$ radians to degrees.`,
      marks: 3,
      section: "Algebra",
      pageBreakAfter: index < count - 1,
      parts: [],
      itemOrder: [],
      contentBlocks: [
        {
          id: `solution-${index}`,
          kind: "text",
          text: "$\\frac{7\\pi}{12}\\times\\frac{180^\\circ}{\\pi}=105^\\circ$\n$\\frac{105}{180}=\\frac{7}{12}$",
          solutionOnly: true,
        },
        {
          id: `table-${index}`,
          kind: "table",
          headers: ["$x$", "$f(x)$"],
          rows: [
            ["$0$", "$0$"],
            ["$1$", ""],
          ],
          solutionEntries: [
            [null, null],
            [null, "$1$"],
          ],
        },
        {
          id: `graph-${index}`,
          kind: "diagram",
          graphConfig: {
            type: "graph2d",
            xMin: -2,
            xMax: 3,
            yMin: -1,
            yMax: 4,
            widthPx: 460,
            heightPx: 240,
            showGrid: true,
            showAxes: true,
            showAxisNumbers: true,
            gridMajorStep: 1,
            functions: [{ expression: "x^2", label: "f", show: true }],
            features: [],
          },
        },
        { id: `space-${index}`, kind: "space", lines: 2 },
      ],
    })),
  };
}

export function investigation() {
  return {
    documentOpen: true,
    frontMatter: {
      titlePageTemplate: "investigation",
      subjectTitle: "MATHEMATICS",
      assessmentTitle: "Patterns investigation",
      investigation: {
        studentPages: [
          {
            id: "page-1",
            heading: "Sequences",
            sections: [{ id: "text-1", heading: "Your task", body: "Investigate $u_n=n^2+n$.\nExplain why $\\frac{u_n}{n}=n+1$." }],
          },
        ],
        criteria: [
          {
            id: "criterion-1",
            heading: "Planning and mathematical formulation",
            marks: 2,
            scoringMode: "additive",
            allocations: [{ id: "allocation-1", description: "A valid algebraic explanation", marks: 2 }],
          },
        ],
      },
    },
    formattingConfig: { id: "investigation" },
    questions: [],
  };
}

// All API traffic is intercepted, including absolute development URLs. These
// rendered tests cannot read or write the teacher's live storage or bridge.
export async function loadFixture(page, draft) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const project = {
      id: "visual",
      name: "Visual tests",
      documentsPath: "/tmp/mauth-visual",
      workspacePath: "/tmp/mauth-visual",
      fileCount: 0,
    };
    let body = {};
    if (pathname.endsWith("/projects/default")) body = project;
    else if (pathname.endsWith("/tests/autosave")) body = { autosave: draft };
    else if (pathname.endsWith("/editor-session")) body = { session: null };
    else if (pathname.endsWith("/logos")) body = { logos: [] };
    else if (pathname.endsWith("/files")) body = { project, files: [] };
    else if (pathname.endsWith("/tests")) body = { tests: [] };
    else if (pathname.endsWith("/browser/register")) {
      const payload = request.postDataJSON();
      body = {
        success: true,
        sessionId: payload.sessionId,
        pollUrl: `/api/agent/current/browser/requests?sessionId=${payload.sessionId}`,
        respondUrl: "/api/agent/current/browser/respond",
      };
    } else if (pathname.endsWith("/browser/requests")) body = { request: null };
    await route.fulfill({ status: 200, json: body });
  });
  await page.addInitScript((value) => {
    localStorage.setItem("mauth-studio.current-draft.v1", JSON.stringify(value));
    localStorage.setItem("mauth-studio.theme.v1", "light");
  }, draft);
  await page.goto("/");
  await page.locator("[data-document-tab-id]").first().waitFor();
}
