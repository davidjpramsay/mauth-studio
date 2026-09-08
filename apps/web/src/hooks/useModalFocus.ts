import { useEffect, useRef } from "react";

const modalStack: HTMLElement[] = [];
const selector =
  "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function useModalFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const container: HTMLElement = element;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push(container);
    const isTop = () => modalStack.at(-1) === container;
    const focusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (element) => element.tabIndex >= 0 && !element.closest('[aria-hidden="true"],[inert]') && element.getClientRects().length > 0,
      );
    const focusFirst = () => (focusable()[0] ?? container).focus();
    const timer = window.setTimeout(() => {
      if (isTop() && !container.contains(document.activeElement)) focusFirst();
    }, 0);
    function keydown(event: KeyboardEvent) {
      if (!isTop() || event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function focusin(event: FocusEvent) {
      if (isTop() && event.target instanceof Node && !container.contains(event.target)) focusFirst();
    }
    window.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusin);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusin);
      const index = modalStack.indexOf(container);
      if (index >= 0) modalStack.splice(index, 1);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return ref;
}
