import { acceleratorDisplayParts } from "../../shared/accelerator";

/**
 * Renders an accelerator (or pre-formatted labels via `parts`) as keycap chips.
 * "lg" is the glassy onboarding style; "sm" fits inline settings controls.
 */
export function Keycaps({
  accelerator,
  parts,
  size = "lg",
}: {
  accelerator?: string;
  parts?: string[];
  size?: "sm" | "lg";
}) {
  const labels = parts ?? acceleratorDisplayParts(accelerator ?? "");
  const chip =
    size === "lg"
      ? "px-2.5 py-1 rounded-lg border border-white/30 bg-white/10 text-[15px] font-semibold text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]"
      : "px-1.5 py-0.5 rounded border border-line bg-bg-700 text-xs font-medium";
  return (
    <span className={`inline-flex items-center ${size === "lg" ? "gap-1.5" : "gap-1"}`}>
      {labels.map((p, i) => (
        <kbd key={i} className={chip}>
          {p}
        </kbd>
      ))}
    </span>
  );
}
