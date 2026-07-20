import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import { EditorPageBreakRow } from "@/components/editor/EditorPageBreakRow";
import {
  EditorSubsectionContainerDropZone,
  EditorSubsectionDragHandle,
  EditorSubsectionItemDropZone,
} from "@/components/editor/EditorSubsectionDragControls";
import { dragPlacementFromEvent, dragPlacementFromRect, setEditorDragImage } from "@/lib/editorDragDom";
import type { ContainerOrderItem, QuestionBlock } from "@/lib/editorDocumentNormalization";
import {
  editorPageBreakCanMoveTo,
  editorPageBreakDestinationForContainer,
  editorPageBreakDestinationForOrderItem,
  editorPageBreakDestinationForTarget,
  editorPageBreakKeyboardDestination,
  editorPageBreakMoveActions,
  subsectionKeyboardMoveIntent,
  subsectionMoveAction,
} from "@/lib/editorNestedDragActions";
import { editorPageBreakTargetHasBreak, mauthTargetFromEditorPageBreak } from "@/lib/editorPageBreakLifecycle";
import { editorSubsectionDragClassName, editorSubsectionDropZoneLabel } from "@/lib/editorSubsectionDragControls";
import {
  EDITOR_PAGE_BREAK_DRAG_MIME,
  EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX,
  SUBSECTION_DRAG_MIME,
  SUBSECTION_DRAG_TEXT_PREFIX,
  containerDropKey,
  containerDropZoneLabel,
  dropIntentBeforeOrderItem,
  dropIntentForContainer,
  editorPageBreakKey,
  editorPageBreakTargetKey,
  isContainerOrderItemKind,
  itemDropKey,
  itemDropZoneLabel,
  parseEditorPageBreakDrag,
  parseSubsectionDrag,
  serializeEditorPageBreakDrag,
  serializeSubsectionDrag,
  subsectionContainerFromDataset,
  subsectionDropIntent,
  subsectionDropPreviewTargetKey,
  subsectionItemKind,
  subsectionKey,
  subsectionTargetFromDataset,
  type EditorPageBreakDropPreview,
  type EditorPageBreakTarget,
  type SubsectionContainerRef,
  type SubsectionDragTarget,
  type SubsectionDropIntent,
  type SubsectionDropPreview,
} from "@/lib/editorSubsectionDrag";
import type { MoveDirection } from "@/lib/documentNavigation";
import type { MauthAction } from "@/lib/mauthActions";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type PanelDragRegion = "header" | "body";

interface PointerSubsectionDragSession {
  target: SubsectionDragTarget;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  lastPreview: SubsectionDropPreview | null;
  handle: HTMLElement;
  cleanup: () => void;
}

export function useNestedEditorDragState() {
  const [draggedSubsection, setDraggedSubsection] = useState<SubsectionDragTarget | null>(null);
  const [dragOverSubsection, setDragOverSubsection] = useState<SubsectionDropPreview | null>(null);
  const [draggedEditorPageBreak, setDraggedEditorPageBreak] = useState<EditorPageBreakTarget | null>(null);
  const [dragOverEditorPageBreak, setDragOverEditorPageBreak] = useState<EditorPageBreakDropPreview | null>(null);
  const pointerDragCleanupRef = useRef<(() => void) | null>(null);

  const clearNestedEditorDrag = useCallback(() => {
    const cleanup = pointerDragCleanupRef.current;
    if (cleanup) {
      pointerDragCleanupRef.current = null;
      cleanup();
      return;
    }
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }, []);

  useEffect(() => {
    return () => pointerDragCleanupRef.current?.();
  }, []);

  return {
    draggedSubsection,
    setDraggedSubsection,
    dragOverSubsection,
    setDragOverSubsection,
    draggedEditorPageBreak,
    setDraggedEditorPageBreak,
    dragOverEditorPageBreak,
    setDragOverEditorPageBreak,
    pointerDragCleanupRef,
    clearNestedEditorDrag,
  };
}

interface UseNestedEditorDragControllerOptions {
  questionsRef: RefObject<QuestionBlock[]>;
  editorPaneRef: RefObject<HTMLElement | null>;
  isNotesTemplate: boolean;
  showEditor: boolean;
  draggedSubsection: SubsectionDragTarget | null;
  setDraggedSubsection: StateSetter<SubsectionDragTarget | null>;
  dragOverSubsection: SubsectionDropPreview | null;
  setDragOverSubsection: StateSetter<SubsectionDropPreview | null>;
  draggedEditorPageBreak: EditorPageBreakTarget | null;
  setDraggedEditorPageBreak: StateSetter<EditorPageBreakTarget | null>;
  dragOverEditorPageBreak: EditorPageBreakDropPreview | null;
  setDragOverEditorPageBreak: StateSetter<EditorPageBreakDropPreview | null>;
  pointerDragCleanupRef: RefObject<(() => void) | null>;
  clearNestedEditorDrag: () => void;
  clearQuestionPageBreakDrag: () => void;
  applyEditorAction: (action: MauthAction) => { ok: boolean };
  applyEditorActions: (actions: MauthAction[]) => unknown;
  selectContextAnchor: (anchor: string, options?: { openEditor?: boolean }) => void;
}

function subsectionTargetElementFromPoint(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof Element)) return null;
  const targetElement = element.closest("[data-subsection-target-kind]");
  if (!(targetElement instanceof HTMLElement)) return null;
  const target = subsectionTargetFromDataset(targetElement.dataset);
  return target ? { element, targetElement, target } : null;
}

function panelDragRegionFromElement(target: EventTarget | null, currentTarget: HTMLElement): PanelDragRegion | null {
  if (!(target instanceof Element)) return null;
  const region = target.closest("[data-panel-region]");
  if (!(region instanceof HTMLElement) || !currentTarget.contains(region)) return null;
  return region.dataset.panelRegion === "body" || region.dataset.panelRegion === "header" ? region.dataset.panelRegion : null;
}

function panelInsideDropIntentForRegion(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  region: PanelDragRegion | null,
  questions: QuestionBlock[],
): SubsectionDropIntent | null {
  if (region !== "body") return null;
  const activeKind = subsectionItemKind(active);
  if (target.kind === "part" && (activeKind === "block" || activeKind === "subpart")) {
    return dropIntentForContainer(active, { kind: "part", questionId: target.questionId, partId: target.id }, questions, "end");
  }
  return null;
}

function subsectionDropPreviewForEvent(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  event: DragEvent<HTMLElement>,
  questions: QuestionBlock[],
): Pick<SubsectionDropPreview, "placement" | "intent"> | null {
  const insideIntent = panelInsideDropIntentForRegion(
    active,
    target,
    panelDragRegionFromElement(event.target, event.currentTarget),
    questions,
  );
  if (insideIntent) return { placement: "inside", intent: insideIntent };
  const placement = dragPlacementFromEvent(event);
  const intent = subsectionDropIntent(active, target, placement, questions);
  return intent ? { placement, intent } : null;
}

function subsectionDropPreviewForPointer(
  active: SubsectionDragTarget,
  target: SubsectionDragTarget,
  targetElement: HTMLElement,
  eventTarget: EventTarget | null,
  clientY: number,
  questions: QuestionBlock[],
): Pick<SubsectionDropPreview, "placement" | "intent"> | null {
  const insideIntent = panelInsideDropIntentForRegion(active, target, panelDragRegionFromElement(eventTarget, targetElement), questions);
  if (insideIntent) return { placement: "inside", intent: insideIntent };
  const placement = dragPlacementFromRect(targetElement.getBoundingClientRect(), clientY);
  const intent = subsectionDropIntent(active, target, placement, questions);
  return intent ? { placement, intent } : null;
}

export function useNestedEditorDragController({
  questionsRef,
  editorPaneRef,
  isNotesTemplate,
  showEditor,
  draggedSubsection,
  setDraggedSubsection,
  dragOverSubsection,
  setDragOverSubsection,
  draggedEditorPageBreak,
  setDraggedEditorPageBreak,
  dragOverEditorPageBreak,
  setDragOverEditorPageBreak,
  pointerDragCleanupRef,
  clearNestedEditorDrag,
  clearQuestionPageBreakDrag,
  applyEditorAction,
  applyEditorActions,
  selectContextAnchor,
}: UseNestedEditorDragControllerOptions) {
  const pointerSubsectionDragRef = useRef<PointerSubsectionDragSession | null>(null);

  function setEditorPageBreak(target: EditorPageBreakTarget, enabled: boolean) {
    applyEditorAction({ type: "pageBreak.set", target: mauthTargetFromEditorPageBreak(target), enabled });
  }

  function editorPageBreakDestinationHasBreak(target: EditorPageBreakTarget) {
    return editorPageBreakTargetHasBreak(questionsRef.current, target);
  }

  function moveEditorPageBreak(source: EditorPageBreakTarget, destination: EditorPageBreakTarget) {
    const actions = editorPageBreakMoveActions(questionsRef.current, source, destination);
    if (actions) applyEditorActions(actions);
  }

  function moveEditorPageBreakByKeyboard(target: EditorPageBreakTarget, direction: MoveDirection) {
    const destination = editorPageBreakKeyboardDestination(questionsRef.current, target, direction);
    if (destination) moveEditorPageBreak(target, destination);
  }

  function moveSubsection(active: SubsectionDragTarget, intent: SubsectionDropIntent) {
    const action = subsectionMoveAction(active, intent);
    if (action) applyEditorAction(action);
  }

  function moveSubsectionByKeyboard(target: SubsectionDragTarget, direction: MoveDirection, anchor: string) {
    const intent = subsectionKeyboardMoveIntent(questionsRef.current, target, direction);
    if (!intent) return false;
    const action = subsectionMoveAction(target, intent);
    if (!action) return false;
    const result = applyEditorAction(action);
    if (!result.ok) return false;
    selectContextAnchor(anchor, { openEditor: showEditor });
    return true;
  }

  function readEditorPageBreakDrag(event: DragEvent<HTMLElement>) {
    return (
      draggedEditorPageBreak ??
      parseEditorPageBreakDrag(event.dataTransfer.getData(EDITOR_PAGE_BREAK_DRAG_MIME)) ??
      parseEditorPageBreakDrag(event.dataTransfer.getData("text/plain"))
    );
  }

  function readSubsectionDrag(event: DragEvent<HTMLElement>) {
    return (
      draggedSubsection ??
      parseSubsectionDrag(event.dataTransfer.getData(SUBSECTION_DRAG_MIME)) ??
      parseSubsectionDrag(event.dataTransfer.getData("text/plain"))
    );
  }

  function handleEditorPageBreakDragStart(event: DragEvent<HTMLElement>, target: EditorPageBreakTarget) {
    event.stopPropagation();
    const payload = serializeEditorPageBreakDrag(target);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${EDITOR_PAGE_BREAK_DRAG_TEXT_PREFIX}${payload}`);
    try {
      event.dataTransfer.setData(EDITOR_PAGE_BREAK_DRAG_MIME, payload);
    } catch {
      // The prefixed text/plain payload above is the cross-browser fallback.
    }
    setEditorDragImage(event);
    clearQuestionPageBreakDrag();
    pointerSubsectionDragRef.current?.cleanup();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedEditorPageBreak(target);
    setDragOverEditorPageBreak(null);
  }

  function handleEditorPageBreakDragOver(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const placement = dragPlacementFromEvent(event);
    const destination = editorPageBreakDestinationForTarget(questionsRef.current, source, target, placement);
    if (!destination || !editorPageBreakCanMoveTo(questionsRef.current, source, destination)) {
      setDragOverEditorPageBreak((current) => (current?.targetKey === editorPageBreakTargetKey(target) ? null : current));
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverEditorPageBreak({ targetKey: editorPageBreakTargetKey(target), placement, destination });
    return true;
  }

  function handleEditorPageBreakContainerDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    placement: "start" | "end",
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const destination = editorPageBreakDestinationForContainer(questionsRef.current, source, container, placement);
    const targetKey = containerDropKey(container, placement);
    if (!destination || !editorPageBreakCanMoveTo(questionsRef.current, source, destination)) {
      setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverEditorPageBreak({ targetKey, placement: "before", destination });
    return true;
  }

  function handleEditorPageBreakContainerDropZoneDrop(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    placement: "start" | "end",
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const targetKey = containerDropKey(container, placement);
    const destination =
      dragOverEditorPageBreak?.targetKey === targetKey
        ? dragOverEditorPageBreak.destination
        : editorPageBreakDestinationForContainer(questionsRef.current, source, container, placement);
    event.preventDefault();
    event.stopPropagation();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (destination && editorPageBreakCanMoveTo(questionsRef.current, source, destination)) moveEditorPageBreak(source, destination);
    return true;
  }

  function handleEditorPageBreakItemDropZoneDragOver(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    beforeItem: ContainerOrderItem,
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const destination = editorPageBreakDestinationForOrderItem(source, container, beforeItem);
    const targetKey = itemDropKey(container, beforeItem);
    if (!destination || !editorPageBreakCanMoveTo(questionsRef.current, source, destination)) {
      setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
      return true;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverEditorPageBreak({ targetKey, placement: "before", destination });
    return true;
  }

  function handleEditorPageBreakItemDropZoneDrop(
    event: DragEvent<HTMLElement>,
    container: SubsectionContainerRef,
    beforeItem: ContainerOrderItem,
  ) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const targetKey = itemDropKey(container, beforeItem);
    const destination =
      dragOverEditorPageBreak?.targetKey === targetKey
        ? dragOverEditorPageBreak.destination
        : editorPageBreakDestinationForOrderItem(source, container, beforeItem);
    event.preventDefault();
    event.stopPropagation();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (destination && editorPageBreakCanMoveTo(questionsRef.current, source, destination)) moveEditorPageBreak(source, destination);
    return true;
  }

  function handleEditorPageBreakDragLeave(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverEditorPageBreak((current) => (current?.targetKey === editorPageBreakTargetKey(target) ? null : current));
  }

  function handleEditorPageBreakDrop(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const source = readEditorPageBreakDrag(event);
    if (!source) return false;
    const placement =
      dragOverEditorPageBreak?.targetKey === editorPageBreakTargetKey(target)
        ? dragOverEditorPageBreak.placement
        : dragPlacementFromEvent(event);
    const destination =
      dragOverEditorPageBreak?.targetKey === editorPageBreakTargetKey(target)
        ? dragOverEditorPageBreak.destination
        : editorPageBreakDestinationForTarget(questionsRef.current, source, target, placement);
    event.preventDefault();
    event.stopPropagation();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    if (destination) moveEditorPageBreak(source, destination);
    return true;
  }

  function handleEditorPageBreakDragEnd() {
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
  }

  function subsectionPointerDropPreview(clientX: number, clientY: number, active: SubsectionDragTarget): SubsectionDropPreview | null {
    const element = document.elementFromPoint(clientX, clientY);
    if (element instanceof Element) {
      const itemDropElement = element.closest("[data-subsection-item-drop]");
      if (itemDropElement instanceof HTMLElement) {
        const container = subsectionContainerFromDataset(itemDropElement.dataset);
        const beforeKind = itemDropElement.dataset.subsectionBeforeItemKind;
        const beforeId = itemDropElement.dataset.subsectionBeforeItemId;
        if (container && isContainerOrderItemKind(beforeKind) && beforeId) {
          const beforeItem: ContainerOrderItem = { kind: beforeKind, id: beforeId };
          const intent = dropIntentBeforeOrderItem(active, container, beforeItem, questionsRef.current);
          if (intent) return { targetKey: itemDropKey(container, beforeItem), placement: "before", intent };
        }
      }

      const containerDropElement = element.closest("[data-subsection-container-drop]");
      if (containerDropElement instanceof HTMLElement) {
        const container = subsectionContainerFromDataset(containerDropElement.dataset);
        const placement = containerDropElement.dataset.subsectionContainerPlacement === "start" ? "start" : "end";
        const intent = container ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
        if (container && intent) return { targetKey: containerDropKey(container, placement), placement: "inside", intent };
      }
    }

    const targetCandidate = subsectionTargetElementFromPoint(clientX, clientY);
    if (!targetCandidate) return null;
    const preview = subsectionDropPreviewForPointer(
      active,
      targetCandidate.target,
      targetCandidate.targetElement,
      targetCandidate.element,
      clientY,
      questionsRef.current,
    );
    return preview
      ? { targetKey: subsectionDropPreviewTargetKey(targetCandidate.target, preview), placement: preview.placement, intent: preview.intent }
      : null;
  }

  function scrollEditorPaneNearPointer(clientY: number) {
    const pane = editorPaneRef.current;
    if (!pane) return;
    const rect = pane.getBoundingClientRect();
    const edgeSize = 72;
    const maxStep = 18;
    const topDistance = clientY - rect.top;
    const bottomDistance = rect.bottom - clientY;
    if (topDistance >= 0 && topDistance < edgeSize) {
      pane.scrollTop -= Math.ceil(((edgeSize - topDistance) / edgeSize) * maxStep);
    } else if (bottomDistance >= 0 && bottomDistance < edgeSize) {
      pane.scrollTop += Math.ceil(((edgeSize - bottomDistance) / edgeSize) * maxStep);
    }
  }

  function beginPointerSubsectionDrag(session: PointerSubsectionDragSession) {
    if (session.active) return;
    session.active = true;
    clearQuestionPageBreakDrag();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    setDraggedSubsection(session.target);
    setDragOverSubsection(null);
  }

  function handleSubsectionPointerDown(event: ReactPointerEvent<HTMLElement>, target: SubsectionDragTarget) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    pointerSubsectionDragRef.current?.cleanup();

    const handle = event.currentTarget;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      if (moveEvent.pointerId !== session.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - session.startX, moveEvent.clientY - session.startY);
      if (!session.active && distance < 4) return;
      moveEvent.preventDefault();
      beginPointerSubsectionDrag(session);
      scrollEditorPaneNearPointer(moveEvent.clientY);
      const preview = subsectionPointerDropPreview(moveEvent.clientX, moveEvent.clientY, session.target);
      session.lastPreview = preview;
      setDragOverSubsection(preview);
    }

    function finishPointerDrag(finishEvent: globalThis.PointerEvent) {
      if (finishEvent.pointerId !== session.pointerId) return;
      finishEvent.preventDefault();
      finishEvent.stopPropagation();
      const preview = session.active
        ? (subsectionPointerDropPreview(finishEvent.clientX, finishEvent.clientY, session.target) ?? session.lastPreview)
        : null;
      session.cleanup();
      if (preview) moveSubsection(session.target, preview.intent);
    }

    const session: PointerSubsectionDragSession = {
      target,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      lastPreview: null,
      handle,
      cleanup: () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishPointerDrag);
        window.removeEventListener("pointercancel", finishPointerDrag);
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        try {
          if (handle.hasPointerCapture(session.pointerId)) handle.releasePointerCapture(session.pointerId);
        } catch {
          // Pointer capture may already be released by the browser.
        }
        if (pointerSubsectionDragRef.current === session) pointerSubsectionDragRef.current = null;
        if (pointerDragCleanupRef.current === session.cleanup) pointerDragCleanupRef.current = null;
        setDraggedSubsection(null);
        setDragOverSubsection(null);
      },
    };

    pointerSubsectionDragRef.current = session;
    pointerDragCleanupRef.current = session.cleanup;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Window-level listeners below keep the drag usable even without capture.
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishPointerDrag, { passive: false });
    window.addEventListener("pointercancel", finishPointerDrag, { passive: false });
  }

  function handleSubsectionDragStart(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    event.stopPropagation();
    const payload = serializeSubsectionDrag(target);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${SUBSECTION_DRAG_TEXT_PREFIX}${payload}`);
    try {
      event.dataTransfer.setData(SUBSECTION_DRAG_MIME, payload);
    } catch {
      // The prefixed text/plain payload above is the cross-browser fallback.
    }
    setEditorDragImage(event);
    clearQuestionPageBreakDrag();
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    setDraggedSubsection(target);
    setDragOverSubsection(null);
  }

  function handleSubsectionDragOver(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const active = readSubsectionDrag(event);
    const preview = active ? subsectionDropPreviewForEvent(active, target, event, questionsRef.current) : null;
    if (!active || !preview) {
      if (active) setDragOverSubsection(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({
      targetKey: subsectionDropPreviewTargetKey(target, preview),
      placement: preview.placement,
      intent: preview.intent,
    });
  }

  function handleSubsectionDragLeave(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverSubsection((current) => (current?.targetKey === subsectionKey(target) ? null : current));
  }

  function handleSubsectionDrop(event: DragEvent<HTMLElement>, target: SubsectionDragTarget) {
    const active = readSubsectionDrag(event);
    const preview = active ? subsectionDropPreviewForEvent(active, target, event, questionsRef.current) : null;
    const activePreview = preview
      ? dragOverSubsection?.targetKey === subsectionDropPreviewTargetKey(target, preview)
        ? dragOverSubsection
        : null
      : null;
    const intent = activePreview?.intent ?? preview?.intent ?? null;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    clearQuestionPageBreakDrag();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    moveSubsection(active, intent);
  }

  function handleSubsectionDragEnd() {
    clearQuestionPageBreakDrag();
    clearNestedEditorDrag();
  }

  function handleContainerDropZoneDragOver(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    if (handleEditorPageBreakContainerDropZoneDragOver(event, container, placement)) return;
    const active = readSubsectionDrag(event);
    const intent = active ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
    if (!active || !intent) {
      if (active) setDragOverSubsection(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({ targetKey: containerDropKey(container, placement), placement: "inside", intent });
  }

  function handleContainerDropZoneDragLeave(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    const targetKey = containerDropKey(container, placement);
    setDragOverSubsection((current) => (current?.targetKey === targetKey ? null : current));
    setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
  }

  function handleContainerDropZoneDrop(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, placement: "start" | "end") {
    if (handleEditorPageBreakContainerDropZoneDrop(event, container, placement)) return;
    const active = readSubsectionDrag(event);
    const targetKey = containerDropKey(container, placement);
    const currentIntent = active ? dropIntentForContainer(active, container, questionsRef.current, placement) : null;
    const intent = dragOverSubsection?.targetKey === targetKey && currentIntent ? dragOverSubsection.intent : currentIntent;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    clearQuestionPageBreakDrag();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    moveSubsection(active, intent);
  }

  function handleItemDropZoneDragOver(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
    if (handleEditorPageBreakItemDropZoneDragOver(event, container, beforeItem)) return;
    const active = readSubsectionDrag(event);
    const intent = active ? dropIntentBeforeOrderItem(active, container, beforeItem, questionsRef.current) : null;
    if (!active || !intent) {
      if (active) setDragOverSubsection(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDragOverSubsection({ targetKey: itemDropKey(container, beforeItem), placement: "before", intent });
  }

  function handleItemDropZoneDragLeave(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    const targetKey = itemDropKey(container, beforeItem);
    setDragOverSubsection((current) => (current?.targetKey === targetKey ? null : current));
    setDragOverEditorPageBreak((current) => (current?.targetKey === targetKey ? null : current));
  }

  function handleItemDropZoneDrop(event: DragEvent<HTMLElement>, container: SubsectionContainerRef, beforeItem: ContainerOrderItem) {
    if (handleEditorPageBreakItemDropZoneDrop(event, container, beforeItem)) return;
    const active = readSubsectionDrag(event);
    const targetKey = itemDropKey(container, beforeItem);
    const currentIntent = active ? dropIntentBeforeOrderItem(active, container, beforeItem, questionsRef.current) : null;
    const intent = dragOverSubsection?.targetKey === targetKey && currentIntent ? dragOverSubsection.intent : currentIntent;
    if (!active || !intent) return;
    event.preventDefault();
    event.stopPropagation();
    clearQuestionPageBreakDrag();
    setDraggedSubsection(null);
    setDragOverSubsection(null);
    setDraggedEditorPageBreak(null);
    setDragOverEditorPageBreak(null);
    moveSubsection(active, intent);
  }

  function subsectionDragClasses(target: SubsectionDragTarget) {
    const dropPlacement =
      dragOverSubsection?.targetKey === subsectionKey(target)
        ? dragOverSubsection.placement
        : dragOverEditorPageBreak?.targetKey === editorPageBreakTargetKey(target)
          ? dragOverEditorPageBreak.placement
          : null;
    return editorSubsectionDragClassName({
      isDragging: Boolean(draggedSubsection && subsectionKey(draggedSubsection) === subsectionKey(target)),
      dropPlacement,
    });
  }

  function containerDropZone(container: SubsectionContainerRef, placement: "start" | "end", visible = true) {
    const targetKey = containerDropKey(container, placement);
    const active = dragOverSubsection?.targetKey === targetKey || dragOverEditorPageBreak?.targetKey === targetKey;
    const subsectionCanDrop = Boolean(
      visible && draggedSubsection && dropIntentForContainer(draggedSubsection, container, questionsRef.current, placement),
    );
    const destination = draggedEditorPageBreak
      ? editorPageBreakDestinationForContainer(questionsRef.current, draggedEditorPageBreak, container, placement)
      : null;
    const pageBreakCanDrop = Boolean(
      visible && draggedEditorPageBreak && editorPageBreakCanMoveTo(questionsRef.current, draggedEditorPageBreak, destination),
    );
    if (!subsectionCanDrop && !pageBreakCanDrop) return null;
    const label = editorSubsectionDropZoneLabel({
      pageBreakCanDrop,
      subsectionCanDrop,
      fallbackLabel: containerDropZoneLabel(container, placement),
    });
    return (
      <EditorSubsectionContainerDropZone
        key={targetKey}
        container={container}
        placement={placement}
        active={active}
        label={label}
        onDragOver={(event) => handleContainerDropZoneDragOver(event, container, placement)}
        onDragLeave={(event) => handleContainerDropZoneDragLeave(event, container, placement)}
        onDrop={(event) => handleContainerDropZoneDrop(event, container, placement)}
      />
    );
  }

  function itemDropZone(container: SubsectionContainerRef, beforeItem: ContainerOrderItem, visible = true) {
    const targetKey = itemDropKey(container, beforeItem);
    const active = dragOverSubsection?.targetKey === targetKey || dragOverEditorPageBreak?.targetKey === targetKey;
    const subsectionCanDrop = Boolean(
      visible && draggedSubsection && dropIntentBeforeOrderItem(draggedSubsection, container, beforeItem, questionsRef.current),
    );
    const destination = draggedEditorPageBreak
      ? editorPageBreakDestinationForOrderItem(draggedEditorPageBreak, container, beforeItem)
      : null;
    const pageBreakCanDrop = Boolean(
      visible && draggedEditorPageBreak && editorPageBreakCanMoveTo(questionsRef.current, draggedEditorPageBreak, destination),
    );
    if (!subsectionCanDrop && !pageBreakCanDrop) return null;
    const label = editorSubsectionDropZoneLabel({
      pageBreakCanDrop,
      subsectionCanDrop,
      fallbackLabel: itemDropZoneLabel(beforeItem),
    });
    return (
      <EditorSubsectionItemDropZone
        key={targetKey}
        container={container}
        beforeItem={beforeItem}
        active={active}
        label={label}
        onDragOver={(event) => handleItemDropZoneDragOver(event, container, beforeItem)}
        onDragLeave={(event) => handleItemDropZoneDragLeave(event, container, beforeItem)}
        onDrop={(event) => handleItemDropZoneDrop(event, container, beforeItem)}
      />
    );
  }

  function subsectionDragHandle(target: SubsectionDragTarget, label: string) {
    return (
      <EditorSubsectionDragHandle
        target={target}
        label={label}
        onPointerDown={(event) => handleSubsectionPointerDown(event, target)}
        onDragStart={(event) => handleSubsectionDragStart(event, target)}
        onDragEnd={handleSubsectionDragEnd}
      />
    );
  }

  function renderEditorPageBreakRow(target: EditorPageBreakTarget) {
    const moving = editorPageBreakKey(draggedEditorPageBreak) === editorPageBreakKey(target);
    return (
      <EditorPageBreakRow
        key={`page-break-row-${editorPageBreakKey(target)}`}
        target={target}
        isNotesTemplate={isNotesTemplate}
        moving={moving}
        onRemove={(pageBreakTarget) => setEditorPageBreak(pageBreakTarget, false)}
        onMoveByKeyboard={moveEditorPageBreakByKeyboard}
        onDragStart={handleEditorPageBreakDragStart}
        onDragEnd={handleEditorPageBreakDragEnd}
      />
    );
  }

  return {
    draggedSubsectionActive: Boolean(draggedSubsection),
    draggedEditorPageBreakActive: Boolean(draggedEditorPageBreak),
    readSubsectionDrag,
    moveSubsectionByKeyboard,
    setEditorPageBreak,
    editorPageBreakDestinationHasBreak,
    subsectionDragClasses,
    subsectionDragHandle,
    containerDropZone,
    itemDropZone,
    renderEditorPageBreakRow,
    handleSubsectionDragOver,
    handleSubsectionDragLeave,
    handleSubsectionDrop,
    handleEditorPageBreakDragOver,
    handleEditorPageBreakDragLeave,
    handleEditorPageBreakDrop,
  };
}
