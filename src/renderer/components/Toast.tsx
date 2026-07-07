import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "ok" | "warn";

interface ToastInput {
  kind?: ToastKind;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastCtx = createContext<(t: ToastInput) => void>(() => {});

/** Push a toast: `const toast = useToast(); toast({ text: "Saved." })`. */
export function useToast() {
  return useContext(ToastCtx);
}

const KIND_CLASSES: Record<ToastKind, string> = {
  ok: "border-ok/40 text-ok",
  warn: "border-warn/40 text-warn",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts, { id, kind: "ok", ...input }]);
      window.setTimeout(() => dismiss(id), input.durationMs ?? 3000);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-3 rounded-md border bg-bg-900 px-3 py-2 text-xs shadow-lg ${KIND_CLASSES[t.kind ?? "ok"]}`}
          >
            <span className="text-slate-200">{t.text}</span>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
