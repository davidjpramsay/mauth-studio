import { Component, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import type { GraphConfig } from "@mauth-studio/shared";
import { graphHeight, graphWidth } from "@/lib/diagramGraph2d";
import type { PrintRenderState } from "@/lib/printReadiness";

export function DiagramRenderPlaceholder({ config, state }: { config: GraphConfig; state?: PrintRenderState }) {
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden bg-white"
      style={{ height: graphHeight(config), maxWidth: graphWidth(config) }}
      data-mauth-print-render-state={state}
      role={state === "error" ? "alert" : undefined}
      aria-label={state === "loading" ? "Loading diagram" : undefined}
    >
      {state === "error" && (
        <span className="flex items-center gap-2 text-sm text-red-700">
          <CircleAlert size={16} />
          Diagram unavailable
        </span>
      )}
    </div>
  );
}

export class DiagramRenderBoundary extends Component<{ config: GraphConfig; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: Readonly<{ config: GraphConfig }>) {
    if (this.state.failed && previous.config !== this.props.config) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <DiagramRenderPlaceholder config={this.props.config} state="error" /> : this.props.children;
  }
}
