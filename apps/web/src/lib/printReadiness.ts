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
  cancelFrame?: (id: number) => void;
  now?: () => number;
  fontsReady?: Promise<unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface WaitForPrintPreviewReadyResult extends PrintReadinessSnapshot {
  timedOut: boolean;
  fontsLoaded: boolean;
  cancelled: boolean;
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
    ready: pending === 0 && errors === 0,
  };
}

export async function waitForPrintPreviewReady(options: WaitForPrintPreviewReadyOptions = {}): Promise<WaitForPrintPreviewReadyResult> {
  const findPrintStage = options.findPrintStage ?? (() => document.querySelector<HTMLElement>(PRINT_PREVIEW_STAGE_SELECTOR));
  const requestFrame = options.requestFrame ?? window.requestAnimationFrame.bind(window);
  const cancelFrame = options.cancelFrame ?? ((id: number) => globalThis.cancelAnimationFrame?.(id));
  const now = options.now ?? performance.now.bind(performance);
  const fontsReady = options.fontsReady ?? globalThis.document?.fonts?.ready;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = now();
  let fontsLoaded = !fontsReady;
  let fontError = false;
  void Promise.resolve(fontsReady).then(
    () => {
      fontsLoaded = true;
    },
    () => {
      fontError = true;
    },
  );

  // A hidden desktop window may suspend animation frames. Every wait has a
  // timer fallback and shares the same deadline, including font settlement.
  const nextFrame = () =>
    new Promise<void>((resolve) => {
      const scheduled: { frame?: number } = {};
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (scheduled.frame !== undefined) cancelFrame(scheduled.frame);
        options.signal?.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, Math.max(0, Math.min(50, timeoutMs - (now() - startedAt))));
      options.signal?.addEventListener("abort", finish, { once: true });
      scheduled.frame = requestFrame(finish);
      if (settled) cancelFrame(scheduled.frame);
    });

  let settledFrames = 0;
  while (true) {
    const snapshot = printReadinessSnapshot(findPrintStage());
    const cancelled = options.signal?.aborted ?? false;
    const ready = snapshot.ready && fontsLoaded && settledFrames >= 2;
    const timedOut = !ready && now() - startedAt >= timeoutMs;
    if (ready || cancelled || timedOut || snapshot.errors > 0 || fontError) {
      return { ...snapshot, ready: ready && !cancelled, timedOut, fontsLoaded, cancelled };
    }
    if (snapshot.ready && fontsLoaded) settledFrames += 1;
    else settledFrames = 0;
    await nextFrame();
  }
}

export function printReadinessMessage(result: WaitForPrintPreviewReadyResult): string {
  if (result.errors)
    return `${result.errors} diagram${result.errors === 1 ? "" : "s"} could not render. Nothing has been printed. Retry, or cancel and check the diagram.`;
  if (!result.fontsLoaded) return "The document fonts have not finished loading. Nothing has been printed. Retry when they are available.";
  if (result.pending)
    return `${result.pending} diagram${result.pending === 1 ? " is" : "s are"} still loading. Nothing has been printed. Please retry.`;
  return "The print preview is not ready. Nothing has been printed. Please retry.";
}
