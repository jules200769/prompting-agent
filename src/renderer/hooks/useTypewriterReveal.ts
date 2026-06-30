import { useCallback, useEffect, useRef, useState } from "react";

export const BASE_CHARS_PER_FRAME = 3;
export const MAX_LAG_CHARS = 120;
export const CATCHUP_CHARS_PER_FRAME = 12;

/** Pure helper — how many characters to reveal this animation frame. */
export function charsForFrame(lag: number): number {
  if (lag > MAX_LAG_CHARS) return CATCHUP_CHARS_PER_FRAME;
  return BASE_CHARS_PER_FRAME;
}

export function useTypewriterReveal() {
  const targetRef = useRef("");
  const displayedLenRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const [displayed, setDisplayed] = useState("");
  const [isRevealing, setIsRevealing] = useState(false);

  const syncDisplayed = useCallback((text: string) => {
    displayedLenRef.current = text.length;
    setDisplayed(text);
    setIsRevealing(false);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const target = targetRef.current;
    const len = displayedLenRef.current;
    if (len >= target.length) {
      setIsRevealing(false);
      rafRef.current = null;
      return;
    }
    const lag = target.length - len;
    const step = charsForFrame(lag);
    const newLen = Math.min(len + step, target.length);
    const newDisplayed = target.slice(0, newLen);
    displayedLenRef.current = newLen;
    setDisplayed(newDisplayed);
    setIsRevealing(newLen < target.length);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureLoop = useCallback(() => {
    if (reducedMotionRef.current) return;
    if (rafRef.current !== null) return;
    if (displayedLenRef.current >= targetRef.current.length) {
      setIsRevealing(false);
      return;
    }
    setIsRevealing(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const appendTarget = useCallback(
    (chunk: string) => {
      if (!chunk) return;
      targetRef.current += chunk;
      if (reducedMotionRef.current) {
        syncDisplayed(targetRef.current);
        return;
      }
      ensureLoop();
    },
    [ensureLoop, syncDisplayed],
  );

  const setTarget = useCallback(
    (full: string) => {
      targetRef.current = full;
      if (reducedMotionRef.current) {
        syncDisplayed(full);
        return;
      }
      ensureLoop();
    },
    [ensureLoop, syncDisplayed],
  );

  const flush = useCallback(() => {
    stopLoop();
    syncDisplayed(targetRef.current);
  }, [stopLoop, syncDisplayed]);

  const reset = useCallback(() => {
    stopLoop();
    targetRef.current = "";
    displayedLenRef.current = 0;
    setDisplayed("");
    setIsRevealing(false);
  }, [stopLoop]);

  const waitUntilRevealed = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const check = () => {
        if (displayedLenRef.current >= targetRef.current.length && rafRef.current === null) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedMotionRef.current = mq.matches;
      if (mq.matches && targetRef.current) {
        stopLoop();
        syncDisplayed(targetRef.current);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      stopLoop();
    };
  }, [stopLoop, syncDisplayed]);

  return {
    displayed,
    isRevealing,
    reset,
    appendTarget,
    setTarget,
    flush,
    waitUntilRevealed,
  };
}
