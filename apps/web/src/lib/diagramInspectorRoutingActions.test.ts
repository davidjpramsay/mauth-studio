import assert from "node:assert/strict";
import test from "node:test";

import { diagramInspectorShowsBaseSettings } from "./diagramInspectorRouting.ts";

test("diagram base settings show only when no renderer child is selected", () => {
  assert.equal(
    diagramInspectorShowsBaseSettings({ hasSelectedFunction: false, hasSelectedFeature: false, hasSelectedGeometryChild: false }),
    true,
  );
  assert.equal(
    diagramInspectorShowsBaseSettings({ hasSelectedFunction: true, hasSelectedFeature: false, hasSelectedGeometryChild: false }),
    false,
  );
  assert.equal(
    diagramInspectorShowsBaseSettings({ hasSelectedFunction: false, hasSelectedFeature: true, hasSelectedGeometryChild: false }),
    false,
  );
  assert.equal(
    diagramInspectorShowsBaseSettings({ hasSelectedFunction: false, hasSelectedFeature: false, hasSelectedGeometryChild: true }),
    false,
  );
});
