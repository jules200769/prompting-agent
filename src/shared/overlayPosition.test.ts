import { describe, it, expect } from "vitest";
import {
  resolveOverlayPosition,
  placementToPosition,
  nearestPlacement,
  isPositionVisible,
  centerInWorkArea,
  OVERLAY_SNAP_MARGIN,
  MIN_VISIBLE_PX,
  type DisplayRect,
} from "./overlayPosition";

const SIZE = { width: 720, height: 520 };
const PRIMARY: DisplayRect = { x: 0, y: 0, width: 1920, height: 1040 };
const SECONDARY: DisplayRect = { x: 1920, y: 0, width: 1920, height: 1080 };

describe("centerInWorkArea", () => {
  it("centers the window within the work area", () => {
    expect(centerInWorkArea(SIZE, PRIMARY)).toEqual({ x: 600, y: 260 });
  });

  it("offsets by the work-area origin", () => {
    expect(centerInWorkArea(SIZE, SECONDARY)).toEqual({ x: 1920 + 600, y: 280 });
  });
});

describe("placementToPosition", () => {
  it("places center", () => {
    expect(placementToPosition("center", SIZE, PRIMARY)).toEqual({ x: 600, y: 260 });
  });

  it("places top-left with margin", () => {
    expect(placementToPosition("topLeft", SIZE, PRIMARY)).toEqual({
      x: OVERLAY_SNAP_MARGIN,
      y: OVERLAY_SNAP_MARGIN,
    });
  });

  it("places top-right with margin", () => {
    expect(placementToPosition("topRight", SIZE, PRIMARY)).toEqual({
      x: PRIMARY.width - SIZE.width - OVERLAY_SNAP_MARGIN,
      y: OVERLAY_SNAP_MARGIN,
    });
  });

  it("places bottom-left with margin", () => {
    expect(placementToPosition("bottomLeft", SIZE, PRIMARY)).toEqual({
      x: OVERLAY_SNAP_MARGIN,
      y: PRIMARY.height - SIZE.height - OVERLAY_SNAP_MARGIN,
    });
  });

  it("places bottom-right with margin", () => {
    expect(placementToPosition("bottomRight", SIZE, PRIMARY)).toEqual({
      x: PRIMARY.width - SIZE.width - OVERLAY_SNAP_MARGIN,
      y: PRIMARY.height - SIZE.height - OVERLAY_SNAP_MARGIN,
    });
  });
});

describe("nearestPlacement", () => {
  it("picks top-left for a point near top-left snap", () => {
    expect(nearestPlacement({ x: 30, y: 30 }, SIZE, PRIMARY)).toBe("topLeft");
  });

  it("picks bottom-right for a point near bottom-right snap", () => {
    const br = placementToPosition("bottomRight", SIZE, PRIMARY);
    expect(nearestPlacement({ x: br.x + 5, y: br.y + 5 }, SIZE, PRIMARY)).toBe("bottomRight");
  });

  it("picks center for a point near center", () => {
    expect(nearestPlacement({ x: 600, y: 260 }, SIZE, PRIMARY)).toBe("center");
  });
});

describe("isPositionVisible", () => {
  it("accepts a fully on-screen position", () => {
    expect(isPositionVisible({ x: 100, y: 100 }, SIZE, [PRIMARY])).toBe(true);
  });

  it("rejects a position beyond every display", () => {
    expect(isPositionVisible({ x: 5000, y: 5000 }, SIZE, [PRIMARY, SECONDARY])).toBe(false);
  });

  it("accepts a position partly off-screen but still grabbable", () => {
    expect(isPositionVisible({ x: -(SIZE.width - MIN_VISIBLE_PX - 1), y: 100 }, SIZE, [PRIMARY])).toBe(true);
  });

  it("rejects a position with less than the minimum visible overlap", () => {
    expect(isPositionVisible({ x: -(SIZE.width - MIN_VISIBLE_PX + 1), y: 100 }, SIZE, [PRIMARY])).toBe(false);
  });

  it("finds visibility on a secondary display", () => {
    expect(isPositionVisible({ x: 2000, y: 200 }, SIZE, [PRIMARY, SECONDARY])).toBe(true);
  });
});

describe("resolveOverlayPosition", () => {
  it("defaults to center placement", () => {
    expect(resolveOverlayPosition("center", SIZE, PRIMARY)).toEqual({ x: 600, y: 260 });
  });

  it("uses the chosen placement on the active work area", () => {
    expect(resolveOverlayPosition("topLeft", SIZE, PRIMARY)).toEqual({
      x: OVERLAY_SNAP_MARGIN,
      y: OVERLAY_SNAP_MARGIN,
    });
  });

  it("offsets by secondary display work area", () => {
    expect(resolveOverlayPosition("topLeft", SIZE, SECONDARY)).toEqual({
      x: SECONDARY.x + OVERLAY_SNAP_MARGIN,
      y: SECONDARY.y + OVERLAY_SNAP_MARGIN,
    });
  });
});
