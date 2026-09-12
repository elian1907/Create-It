import { useEffect } from "react";

/** A single delegated light source; never animates charts or intercepts input. */
export function GlassHighlights() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const contrast = matchMedia("(prefers-contrast: more)");
    const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
    let frame = 0,
      x = 0,
      y = 0;
    let targets: HTMLElement[] = [];
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      targets.forEach((element) => {
        element.style.removeProperty("--glass-x");
        element.style.removeProperty("--glass-y");
        element.removeAttribute("data-glass-lit");
      });
      targets = [];
    };
    const move = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" ||
        reduced.matches ||
        contrast.matches ||
        transparency.matches
      )
        return;
      const element = event.target instanceof Element ? event.target : null;
      const surface = element?.closest<HTMLElement>(
        ".stat-card, .panel, .export-card, .avatar-card, .template-card, .media-card, .welcome",
      );
      const control = element?.closest<HTMLElement>(
        ".button, .sidebar a.active, .segmented button.active",
      );
      const next = [surface, control].filter(
        (node): node is HTMLElement => !!node,
      );
      if (
        next.length !== targets.length ||
        next.some((node, i) => node !== targets[i])
      ) {
        clear();
        targets = next;
      }
      x = event.clientX;
      y = event.clientY;
      if (frame || !targets.length) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        targets.forEach((node) => {
          const rect = node.getBoundingClientRect();
          node.style.setProperty(
            "--glass-x",
            `${Math.max(0, Math.min(100, ((x - rect.left) / Math.max(1, rect.width)) * 100))}%`,
          );
          node.style.setProperty(
            "--glass-y",
            `${Math.max(0, Math.min(100, ((y - rect.top) / Math.max(1, rect.height)) * 100))}%`,
          );
          node.setAttribute("data-glass-lit", "true");
        });
      });
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) clear();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("blur", clear);
    [reduced, contrast, transparency].forEach((query) =>
      query.addEventListener("change", clear),
    );
    return () => {
      clear();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("blur", clear);
      [reduced, contrast, transparency].forEach((query) =>
        query.removeEventListener("change", clear),
      );
    };
  }, []);
  return null;
}
