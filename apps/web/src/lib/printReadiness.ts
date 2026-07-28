export const PRINT_PREVIEW_STAGE_SELECTOR = ".print-preview-stage";
export const PRINT_RENDER_STATE_ATTRIBUTE = "data-mauth-print-render-state";
export const PRINT_RENDER_STATE_SELECTOR = `[${PRINT_RENDER_STATE_ATTRIBUTE}]`;

export type PrintRenderState = "loading" | "ready" | "error";

export interface PrintReadinessSnapshot {
  mounted: boolean;
  total: number;
  pending: number;
  errors: number;
  ready: boolean;
}

export interface WaitForPrintPreviewReadyOptions {
  findPrintStage?: () => ParentNode | null;
  requestFrame?: (callback: FrameRequestCallback) => number;
  now?: () => number;
  fontsReady?: Promise<unknown>;
  timeoutMs?: number;
}

export interface WaitForPrintPreviewReadyResult extends PrintReadinessSnapshot {
  timedOut: boolean;
}

function renderState(element: Element): PrintRenderState {
  const value = element.getAttribute(PRINT_RENDER_STATE_ATTRIBUTE);
  if (value === "ready" || value === "error") return value;
  return "loading";
}

export function printReadinessSnapshot(stage: ParentNode | null): PrintReadinessSnapshot {
  if (!stage) return { mounted: false, total: 0, pending: 0, errors: 0, ready: false };

  const states = Array.from(stage.querySelectorAll(PRINT_RENDER_STATE_SELECTOR), renderState);
  const pending = states.filter((state) => state === "loading").length;
  const errors = states.filter((state) => state === "error").length;

  return {
    mounted: true,
    total: states.length,
    pending,
    errors,
    ready: pending === 0,
  };
}

export async function waitForPrintPreviewReady(options: WaitForPrintPreviewReadyOptions = {}): Promise<WaitForPrintPreviewReadyResult> {
  const findPrintStage = options.findPrintStage ?? (() => document.querySelector<HTMLElement>(PRINT_PREVIEW_STAGE_SELECTOR));
  const requestFrame = options.requestFrame ?? window.requestAnimationFrame.bind(window);
  const now = options.now ?? performance.now.bind(performance);
  const fontsReady = options.fontsReady ?? document.fonts?.ready;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = now();
  const nextFrame = () => new Promise<void>((resolve) => requestFrame(() => resolve()));

  let snapshot = printReadinessSnapshot(findPrintStage());
  while (!snapshot.ready && now() - startedAt < timeoutMs) {
    await nextFrame();
    snapshot = printReadinessSnapshot(findPrintStage());
  }

  if (fontsReady) {
    await Promise.resolve(fontsReady).catch(() => undefined);
  }

  // Give React, Plotly, and the browser two settled layout frames after the
  // final asynchronous surface reports ready before print media is activated.
  await nextFrame();
  await nextFrame();

  return { ...snapshot, timedOut: !snapshot.ready };
}
