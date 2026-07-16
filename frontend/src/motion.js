import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll. Attach the returned ref to an element; it starts hidden
 * (add the `k-reveal` class) and gets `is-in` when it scrolls into view.
 * Respects prefers-reduced-motion (reveals immediately).
 */
export function useReveal(options = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { setShown(true); io.disconnect(); break; }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12, ...options },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, options]);
  return [ref, shown];
}

/** Animate a number from 0 → `value` once, for headline figures. */
export function useCountUp(value, duration = 900) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0;
    if (typeof window === "undefined" ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target); return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setN(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return n;
}

/** Close on Escape and on outside click — for popovers/menus. */
export function useDismiss(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open, onClose]);
  return ref;
}
