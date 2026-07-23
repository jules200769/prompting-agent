// Shared Framer Motion presets for the Studio. Every animation degrades
// gracefully when the user prefers reduced motion (see useReducedMotionSafe).
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

/** Spring presets tuned for a weighty, premium feel. */
export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.9 } as Transition,
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 1 } as Transition,
  gentle: { type: "spring", stiffness: 180, damping: 26 } as Transition,
};

/** Fade + rise, used for cards and content blocks entering view. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: spring.soft },
};

/** Container that cascades its children on mount. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

/** Route-level transition for the main content pane. */
export const viewTransition: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ...spring.soft, staggerChildren: 0.05, delayChildren: 0.03 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16, ease: "easeIn" } },
};

/** Modal card entrance. */
export const modalPop: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.14, ease: "easeIn" } },
};

/**
 * Returns motion helpers that collapse to opacity-only (or no) movement when the
 * OS "reduce motion" setting is on. Spread the returned variants/transition into
 * motion components so a single guard covers the whole tree.
 */
export function useReducedMotionSafe() {
  const reduce = useReducedMotion();
  return {
    reduce: Boolean(reduce),
    /** Collapse motion to opacity-only (drop x/y/scale) when reduced motion is on. */
    variants(base: Variants): Variants {
      if (!reduce) return base;
      const flat: Variants = {};
      for (const [key, value] of Object.entries(base)) {
        if (value && typeof value === "object") {
          const source = value as { opacity?: number; transition?: Transition };
          flat[key] = { opacity: source.opacity ?? 1, transition: source.transition };
        } else {
          flat[key] = value;
        }
      }
      return flat;
    },
    /** Hover lift that becomes a no-op under reduced motion. */
    hoverLift(y = -3): { y: number } | undefined {
      return reduce ? undefined : { y };
    },
    tap: reduce ? undefined : { scale: 0.985 },
  };
}
