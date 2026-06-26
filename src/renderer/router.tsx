import { lazy, Suspense, useEffect, useState } from "react";
import { Overlay } from "./views/Overlay";

const Studio = lazy(() => import("./views/Studio").then((m) => ({ default: m.Studio })));

function route(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/studio") ? "studio" : "overlay";
}

export function Router() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const onHash = () => setR(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return r === "studio" ? (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  ) : (
    <Overlay />
  );
}
