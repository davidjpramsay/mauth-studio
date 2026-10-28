// Feedback lives outside SVG viewBoxes and zoomed preview pages so its stroke
// and gap use the same screen pixels for every diagram renderer.
export function showDiagramLabelFeedback(label: Element) {
  const overlay = document.createElement("div");
  overlay.className = "diagram-label-feedback";
  overlay.setAttribute("aria-hidden", "true");
  document.body.append(overlay);
  let frame = 0;
  const stop = () => {
    window.cancelAnimationFrame(frame);
    overlay.remove();
  };
  const update = () => {
    if (!label.isConnected) return stop();
    const box = label.getBoundingClientRect();
    Object.assign(overlay.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      visibility: box.width && box.height ? "visible" : "hidden",
    });
    frame = window.requestAnimationFrame(update);
  };
  update();
  return stop;
}
