import { lazy, Suspense, useEffect, useState } from "react";
import { Overlay } from "./views/Overlay";
import { isBrowserMock } from "./api";

const Studio = lazy(() => import("./views/Studio").then((m) => ({ default: m.Studio })));

function route(): "studio" | "overlay-preview" | "overlay" {
  const h = window.location.hash.replace(/^#/, "");
  if (h.startsWith("/studio")) return "studio";
  if (h.startsWith("/overlay-preview")) return "overlay-preview";
  return "overlay";
}

/**
 * Browser-only preview of the hotkey overlay so people (and AI agents) can open
 * and inspect the popup at a plain URL. It adds a backdrop the transparent
 * Electron overlay normally lacks, then renders the real Overlay unchanged.
 */
function OverlayPreview() {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 20% 0%, #2b2f45 0%, #14151f 55%, #0a0a0f 100%)",
        }}
      />
      <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur">
        Overlay preview (browser mock — not Electron)
      </div>
      <div className="relative z-10 h-full w-full">
        <Overlay />
      </div>
    </div>
  );
}

export function Router() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const onHash = () => setR(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (r === "studio") {
    return (
      <Suspense fallback={null}>
        <Studio />
      </Suspense>
    );
  }
  // Preview route is intended for the browser mock; in Electron it still works
  // but adds a backdrop, so only enable the backdrop wrapper outside Electron.
  if (r === "overlay-preview" && isBrowserMock) {
    return <OverlayPreview />;
  }
  return <Overlay />;
}
