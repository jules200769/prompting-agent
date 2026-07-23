import { useCallback, useRef } from "react";

/**
 * Tracks the cursor across an element and writes its position to the `--mx` /
 * `--my` custom properties, so CSS can paint a spotlight that follows the pointer.
 * Pair with the `.studio-card--spotlight` class (or any rule reading those vars).
 */
export function useSpotlight<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);

  const onMouseMove = useCallback((event: React.MouseEvent<T>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    node.style.setProperty("--mx", `${x}%`);
    node.style.setProperty("--my", `${y}%`);
  }, []);

  return { ref, onMouseMove };
}
