// Pure overlay placement logic — testable without Electron/screen deps.

import type { OverlayPlacement } from "./types";
import { OVERLAY_PLACEMENTS } from "./types";

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

/** A display work area in screen coordinates (Electron Display.workArea shape). */
export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inset from work-area edges for corner snap positions. */
export const OVERLAY_SNAP_MARGIN = 24;

/** Minimum overlap (px) that must stay on a display so the overlay can be grabbed again. */
export const MIN_VISIBLE_PX = 48;

/** Whether enough of the window overlaps some display to remain reachable. */
export function isPositionVisible(
  pos: OverlayPoint,
  size: OverlaySize,
  displays: DisplayRect[],
): boolean {
  return displays.some((d) => {
    const overlapX = Math.min(pos.x + size.width, d.x + d.width) - Math.max(pos.x, d.x);
    const overlapY = Math.min(pos.y + size.height, d.y + d.height) - Math.max(pos.y, d.y);
    return overlapX >= MIN_VISIBLE_PX && overlapY >= MIN_VISIBLE_PX;
  });
}

/** Center a window within a work area. */
export function centerInWorkArea(size: OverlaySize, workArea: DisplayRect): OverlayPoint {
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + (workArea.height - size.height) / 2),
  };
}

/** Screen coordinates for a snap placement within a work area. */
export function placementToPosition(
  placement: OverlayPlacement,
  size: OverlaySize,
  workArea: DisplayRect,
): OverlayPoint {
  const m = OVERLAY_SNAP_MARGIN;
  switch (placement) {
    case "topLeft":
      return { x: Math.round(workArea.x + m), y: Math.round(workArea.y + m) };
    case "topRight":
      return {
        x: Math.round(workArea.x + workArea.width - size.width - m),
        y: Math.round(workArea.y + m),
      };
    case "bottomLeft":
      return {
        x: Math.round(workArea.x + m),
        y: Math.round(workArea.y + workArea.height - size.height - m),
      };
    case "bottomRight":
      return {
        x: Math.round(workArea.x + workArea.width - size.width - m),
        y: Math.round(workArea.y + workArea.height - size.height - m),
      };
    case "center":
    default:
      return centerInWorkArea(size, workArea);
  }
}

/** Pick the snap zone whose anchor is closest to a legacy saved point (migration). */
export function nearestPlacement(
  saved: OverlayPoint,
  size: OverlaySize,
  workArea: DisplayRect,
): OverlayPlacement {
  let best: OverlayPlacement = "center";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const placement of OVERLAY_PLACEMENTS) {
    const pos = placementToPosition(placement, size, workArea);
    const dx = saved.x - pos.x;
    const dy = saved.y - pos.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = placement;
    }
  }
  return best;
}

/**
 * Resolve overlay screen position from the user's snap placement on the active display work area.
 */
export function resolveOverlayPosition(
  placement: OverlayPlacement,
  size: OverlaySize,
  activeWorkArea: DisplayRect,
): OverlayPoint {
  return placementToPosition(placement, size, activeWorkArea);
}
