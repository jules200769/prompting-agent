import type { CSSProperties } from "react";

/**
 * Layout-shaped shimmer placeholder. Compose several to mirror the real content
 * that is loading rather than showing a spinner.
 */
export function Skeleton({
  width = "100%",
  height = 12,
  radius = 8,
  className = "",
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`studio-skeleton ${className}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** A stack of text-line skeletons, last line shortened like real prose. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`studio-skeleton-lines ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} height={11} width={index === lines - 1 ? "62%" : "100%"} />
      ))}
    </div>
  );
}
