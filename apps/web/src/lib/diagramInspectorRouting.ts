interface DiagramInspectorRoutingState {
  hasSelectedFunction: boolean;
  hasSelectedFeature: boolean;
  hasSelectedGeometryChild: boolean;
}

export function diagramInspectorShowsBaseSettings(state: DiagramInspectorRoutingState) {
  return !state.hasSelectedFunction && !state.hasSelectedFeature && !state.hasSelectedGeometryChild;
}
