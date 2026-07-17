import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { api } from "../api";
import { useTypewriterReveal } from "../hooks/useTypewriterReveal";
import type { CaptureContext, CaptureMode, ModelId, OptLevel, OverlayPlacement, PromptType } from "../../shared/types";
import { MODELS, LEVEL_LABELS, LEVEL_COLORS } from "../../shared/types";
import { toTerminalSingleLine, stripTerminalStreamChunk } from "../../shared/terminalOutput";
import {
  type ContextImportScope,
  contextImportPromptFor,
} from "../../shared/contextImportPrompt";
import { SESSION_CONTEXT_MAX_CHARS, type ProjectContext, type SessionContext } from "../../shared/session";
import { OverlayPlacementPicker } from "../components/OverlayPlacementPicker";
import { ModelPicker } from "../components/ModelPicker";
import { WritingTypePicker, type WritingType, writingLevelLabels } from "../components/WritingTypePicker";

type Phase = "idle" | "capturing" | "optimizing" | "done" | "error";

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const SLIDER_TRACK_W = 132;
const SLIDER_EDGE = 13;

function LevelSlider({
  level,
  onChange,
  disabled,
  labels = LEVEL_LABELS,
}: {
  level: OptLevel;
  onChange: (l: OptLevel) => void;
  disabled?: boolean;
  labels?: Record<OptLevel, string>;
}) {
  const activeLabel = labels[level];
  const levels = [1, 2, 3, 4] as OptLevel[];
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState((level - 1) / 3);

  const thumbPct = dragging ? dragPct : (level - 1) / 3;
  const travel = SLIDER_TRACK_W - SLIDER_EDGE * 2;
  const center = SLIDER_EDGE + travel * thumbPct;

  const updateFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const span = rect.width - SLIDER_EDGE * 2;
    let pct = span > 0 ? (clientX - rect.left - SLIDER_EDGE) / span : 0;
    pct = Math.min(1, Math.max(0, pct));
    setDragPct(pct);
    const next = (Math.round(pct * 3) + 1) as OptLevel;
    if (next !== level) onChange(next);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragging) updateFromX(e.clientX);
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, level - 1) as OptLevel);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(4, level + 1) as OptLevel);
    }
  };

  return (
    <div
      className="level-slider flex items-center gap-2.5 shrink-0"
      role="group"
      aria-label={`Guide depth L${level} ${activeLabel}`}
    >
      <div
        ref={trackRef}
        className={`level-slider__track relative h-[26px] rounded-full touch-none ${
          disabled ? "opacity-40" : "cursor-pointer"
        }`}
        style={{ width: SLIDER_TRACK_W }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={level}
        aria-valuetext={`L${level} ${activeLabel}`}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="level-slider__lane absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-between px-[11px] pointer-events-none">
          {levels.map((l) => (
            <span key={l} className="w-[3px] h-[3px] rounded-full bg-white/25" />
          ))}
        </div>
        <div
          className={`level-slider__fill absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full pointer-events-none ${
            dragging ? "" : "level-slider__fill--rest"
          }`}
          style={{ width: center }}
        />
        <div
          className={`level-slider__thumb absolute top-1/2 w-5 h-5 rounded-full pointer-events-none ${
            dragging ? "" : "level-slider__thumb--rest"
          }`}
          style={{ left: center, transform: `translate(-50%, -50%) scale(${dragging ? 1.14 : 1})` }}
        />
      </div>
      <span
        key={`${level}-${activeLabel}`}
        className="level-slider__label text-[13px] font-semibold leading-none select-none text-left whitespace-nowrap"
        style={{ color: LEVEL_COLORS[level], minWidth: 34 }}
      >
        {activeLabel}
      </span>
    </div>
  );
}

type OverlaySegmentMode = "prompting" | "writing";

function ModeSegmentPill({
  value,
  onChange,
  disabled,
}: {
  value: OverlaySegmentMode;
  onChange: (mode: OverlaySegmentMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full p-0.5 bg-white/10 border border-white/15 shrink-0"
      role="group"
      aria-label="Mode"
    >
      {(["prompting", "writing"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`px-3 py-1 rounded-full text-[13px] font-medium leading-none inline-flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed ${
            value === option
              ? "bg-white/25 text-white shadow-sm"
              : "text-white/55 hover:text-white/75"
          }`}
        >
          <span className="inline-block -translate-y-0.5">{option}</span>
        </button>
      ))}
    </div>
  );
}

function ContextScopePill({
  value,
  onChange,
  sessionConfigured,
  projectConfigured,
}: {
  value: ContextImportScope;
  onChange: (scope: ContextImportScope) => void;
  sessionConfigured: boolean;
  projectConfigured: boolean;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full p-0.5 bg-white/10 border border-white/15 shrink-0"
      role="group"
      aria-label="Context scope"
    >
      {([
        { id: "session", label: "Session", configured: sessionConfigured },
        { id: "project", label: "Project", configured: projectConfigured },
      ] as const).map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-label={
            option.configured ? `${option.label}, configured` : `${option.label}, not configured`
          }
          className={`h-6 px-2.5 rounded-full text-[12px] font-medium leading-none inline-flex items-center justify-center transition ${
            value === option.id
              ? "bg-white/25 text-white shadow-sm"
              : "text-white/55 hover:text-white/75"
          }`}
        >
          <span className="inline-flex items-center gap-1.5 translate-y-px">
            {option.configured ? (
              <span className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" aria-hidden />
            ) : null}
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Empty-output hint: which standing contexts are attached to Refine. */
function contextStatusPlaceholder(
  activeSession: SessionContext | null,
  projectOn: boolean,
): string {
  const sessionOn = Boolean(activeSession?.contextText.trim());
  const sessionPart = sessionOn
    ? `Session: on — ${activeSession!.title}`
    : "Session: off";
  const projectPart = projectOn ? "Project: on" : "Project: off";
  return `${sessionPart} · ${projectPart}`;
}

function GlassPill({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`apple-glass-pill px-5 py-1.5 rounded-full text-[15px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function Overlay() {
  const [mode, setMode] = useState<CaptureMode>("field");
  const [model, setModel] = useState<ModelId>("claude-opus-4.8");
  const [level, setLevel] = useState<OptLevel>(2);
  const [promptType, setPromptType] = useState<PromptType>("auto");
  const [segmentMode, setSegmentMode] = useState<OverlaySegmentMode>("prompting");
  const [writingType, setWritingType] = useState<WritingType>("question");
  const [overlayPlacement, setOverlayPlacement] = useState<OverlayPlacement>("center");
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [outputText, setOutputText] = useState("");
  const {
    displayed,
    isRevealing,
    reset: resetTypewriter,
    appendTarget,
    setTarget,
    flush,
    waitUntilRevealed,
  } = useTypewriterReveal();
  const [hasGenerated, setHasGenerated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shellVisible, setShellVisible] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [terminalContext, setTerminalContext] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [newSessionPickerOpen, setNewSessionPickerOpen] = useState(false);
  const [pickerProjects, setPickerProjects] = useState<ProjectContext[]>([]);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectContext | null>(null);
  const [contextImportScope, setContextImportScope] = useState<ContextImportScope>("session");
  const [importedSessionContext, setImportedSessionContext] = useState("");
  const [importedProjectContext, setImportedProjectContext] = useState("");
  /** Persisted standing project context — drives the empty-output status hint. */
  const [standingProjectContext, setStandingProjectContext] = useState("");
  const [importPromptCopied, setImportPromptCopied] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionContext | null>(null);
  const [sessions, setSessions] = useState<SessionContext[]>([]);
  const captureRef = useRef<{
    text: string;
    mode: CaptureMode;
    snapshot: { text: string; hasText: boolean };
    terminalContext?: boolean;
    context?: CaptureContext;
  } | null>(null);
  const defaultModelRef = useRef<ModelId>("claude-opus-4.8");
  const menuRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const keyStateRef = useRef({ mode, phase, captureFailed: false });
  const actionsRef = useRef<{ runOptimize: () => void; onApply: () => void; onCopy: () => void }>({
    runOptimize: () => {},
    onApply: () => {},
    onCopy: () => {},
  });

  keyStateRef.current = { mode, phase, captureFailed: mode === "empty" };

  const isTerminalSession = mode === "terminal" || terminalContext;

  function ackOverlayPrepared(): void {
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      api.overlayPrepared();
    });
  }

  function refreshActiveSession(): void {
    void api.sessionGetActive().then(setActiveSession);
  }

  function refreshStandingProjectContext(): void {
    void api.projectContextGet().then(setStandingProjectContext);
  }

  function resetOverlaySession(): void {
    flushSync(() => {
      captureRef.current = null;
      setMode("field");
      setPrompt("");
      setPhase("idle");
      resetTypewriter();
      setOutputText("");
      setHasGenerated(false);
      setMenuOpen(false);
      setApplyNotice(null);
      setTerminalContext(false);
      setPromptType("auto");
      setSegmentMode("prompting");
      setWritingType("question");
      setShellVisible(false);
      setContextModalOpen(false);
      setNewSessionPickerOpen(false);
      setContextSaved(false);
      setImportPromptCopied(false);
    });
    refreshActiveSession();
    refreshStandingProjectContext();
    ackOverlayPrepared();
  }

  useEffect(() => {
    (async () => {
      const s = await api.settingsGet();
      defaultModelRef.current = s.defaultModel;
      setModel(s.defaultModel);
      setLevel(s.defaultLevel);
      setOverlayPlacement(s.overlayPlacement);
    })();
    // Restore the persisted active session + project context (survives app restarts).
    void api.sessionGetActive().then(setActiveSession);
    void api.projectContextGet().then(setStandingProjectContext);

    const applyCapture = (detail: {
      text: string;
      mode: CaptureMode;
      snapshot: { text: string; hasText: boolean };
      terminalContext?: boolean;
      context?: CaptureContext;
    }) => {
      flushSync(() => {
        captureRef.current = {
          text: detail.text,
          mode: detail.mode,
          snapshot: detail.snapshot ?? { text: "", hasText: false },
          terminalContext: detail.terminalContext,
          context: detail.context,
        };
        // Destination-aware model preselect: suggestion wins for this session,
        // manual pick afterwards wins for the run; defaultModel is never written.
        setModel(detail.context?.suggestedModel ?? defaultModelRef.current);
        setMode(detail.mode);
        setTerminalContext(Boolean(detail.terminalContext));
        setPromptType("auto");
        setSegmentMode("prompting");
        setWritingType("question");
        setPrompt(detail.text);
        setPhase("idle");
        resetTypewriter();
        setOutputText("");
        setHasGenerated(false);
        setMenuOpen(false);
        setApplyNotice(null);
        setShellVisible(true);
        setContextModalOpen(false);
        setNewSessionPickerOpen(false);
        setContextSaved(false);
        setImportPromptCopied(false);
      });
      void api.sessionGetActive().then(setActiveSession);
      void api.projectContextGet().then(setStandingProjectContext);
      ackOverlayPrepared();
    };

    const onCapturePending = () => {
      captureRef.current = null;
      setMode("field");
      setTerminalContext(false);
      setPromptType("auto");
      setSegmentMode("prompting");
      setWritingType("question");
      setPrompt("");
      setPhase("capturing");
      resetTypewriter();
      setOutputText("");
      setHasGenerated(false);
      setMenuOpen(false);
      setApplyNotice(null);
      ackOverlayPrepared();
    };

    const offPending = api.onOverlayCapturePending(onCapturePending);
    const offShow = api.onOverlayShow(applyCapture);
    const offClear = api.onOverlayClear(resetOverlaySession);
    return () => {
      offPending?.();
      offShow?.();
      offClear?.();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // Recent sessions for the switcher, fetched on menu open.
  useEffect(() => {
    if (!menuOpen) return;
    void api.sessionList().then(setSessions);
  }, [menuOpen]);

  async function onNewSession() {
    setMenuOpen(false);
    setPendingDeleteProject(null);
    setNewSessionPickerOpen(true);
    const [{ projects }, sessionList] = await Promise.all([api.projectList(), api.sessionList()]);
    setPickerProjects(projects);
    setSessions(sessionList);
  }

  /** One-click: pick a project (or none) and start the session immediately. */
  async function onStartNewSession(projectId: string | null) {
    const session = await api.sessionCreate(projectId);
    setActiveSession(session);
    if (!projectId) {
      await api.projectSetActive(null);
      setStandingProjectContext("");
      setImportedProjectContext("");
    } else {
      const chosen = pickerProjects.find((p) => p.id === projectId);
      const activated = await api.projectSetActive(projectId);
      const text = activated?.contextText ?? chosen?.contextText ?? "";
      setStandingProjectContext(text);
      setImportedProjectContext(text);
    }
    setPendingDeleteProject(null);
    setNewSessionPickerOpen(false);
  }

  async function onConfirmDeleteProject() {
    if (!pendingDeleteProject) return;
    const id = pendingDeleteProject.id;
    await api.projectDelete(id);
    setPickerProjects((prev) => prev.filter((p) => p.id !== id));
    setSessions((prev) => prev.filter((s) => s.projectId !== id));
    if (activeSession?.projectId === id) {
      setActiveSession(await api.sessionGetActive());
    }
    const stillActive = await api.projectContextGet();
    setStandingProjectContext(stillActive);
    if (!stillActive.trim()) setImportedProjectContext("");
    setPendingDeleteProject(null);
  }

  async function onClearSession() {
    if (!activeSession) return;
    setActiveSession(await api.sessionClear(activeSession.id));
    setMenuOpen(false);
  }

  async function onResumeSession(id: string) {
    const session = await api.sessionSetActive(id);
    setActiveSession(session);
    if (session?.projectId) {
      const activated = await api.projectSetActive(session.projectId);
      const text = activated?.contextText ?? "";
      setStandingProjectContext(text);
      setImportedProjectContext(text);
    } else {
      await api.projectSetActive(null);
      setStandingProjectContext("");
      setImportedProjectContext("");
    }
    setMenuOpen(false);
  }

  async function onDeleteSession(id: string) {
    await api.sessionDelete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSession?.id === id) {
      setActiveSession(await api.sessionGetActive());
    }
  }

  async function onAddToContext() {
    if (contextImportScope === "project") {
      const project = await api.projectUpsertActive(importedProjectContext);
      setStandingProjectContext(project.contextText);
      setImportedProjectContext(project.contextText);
    } else {
      const target = activeSession ?? (await api.sessionCreate());
      setActiveSession(await api.sessionSetContext(target.id, importedSessionContext));
    }
    setContextSaved(true);
    window.setTimeout(() => {
      setContextSaved(false);
      setContextModalOpen(false);
    }, 900);
  }

  async function runOptimize() {
    if (!prompt.trim()) return;
    setApplyNotice(null);
    resetTypewriter();
    setPhase("optimizing");
    setOutputText("");
    try {
      const res = await api.optimize(
        {
          prompt,
          model,
          level,
          skipCache: hasGenerated,
          terminalContext: isTerminalSession,
          promptType,
          writingType: segmentMode === "writing" ? writingType : undefined,
          captureContext: captureRef.current?.context,
        },
        isTerminalSession ? (chunk) => appendTarget(stripTerminalStreamChunk(chunk)) : appendTarget,
      );
      const refined = isTerminalSession ? toTerminalSingleLine(res.optimizedPrompt) : res.optimizedPrompt;
      setTarget(refined);
      await waitUntilRevealed();
      setOutputText(refined);
      setHasGenerated(true);
      setPhase("done");
    } catch (e: any) {
      const msg = `Error: ${e?.message ?? e}`;
      setTarget(msg);
      flush();
      setOutputText(msg);
      setHasGenerated(true);
      setPhase("error");
    }
  }

  async function onApply() {
    if (!outputText.trim() || phase !== "done") return;
    setApplyNotice(null);
    const text = isTerminalSession ? toTerminalSingleLine(outputText) : outputText;
    const res = await api.captureInject(text, captureRef.current?.snapshot ?? { text: "", hasText: false });
    if (res === "copied") {
      setApplyNotice("Couldn't insert — copied to clipboard");
    }
  }

  async function onCopy() {
    if (!outputText.trim()) return;
    const text = isTerminalSession ? toTerminalSingleLine(outputText) : outputText;
    await api.captureCopy(text);
  }

  async function onCopyImportPrompt() {
    await api.captureCopy(contextImportPromptFor(contextImportScope));
    setImportPromptCopied(true);
    window.setTimeout(() => setImportPromptCopied(false), 2000);
  }

  function onContextImportScopeChange(scope: ContextImportScope) {
    if (scope === contextImportScope) return;
    setContextImportScope(scope);
    setImportPromptCopied(false);
  }

  async function onPlacementChange(placement: OverlayPlacement) {
    setOverlayPlacement(placement);
    await api.setOverlayPlacement(placement);
  }

  actionsRef.current = {
    runOptimize: () => void runOptimize(),
    onApply: () => void onApply(),
    onCopy: () => void onCopy(),
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { mode: m, phase: p, captureFailed: failed } = keyStateRef.current;
      const tag = (e.target as HTMLElement).tagName;
      const inEditable = tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT";
      if (e.key === "Escape") api.hideOverlay();
      if (
        !inEditable &&
        (m === "field" || m === "terminal" || m === "empty") &&
        ["1", "2", "3", "4"].includes(e.key) &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        setLevel(Number(e.key) as OptLevel);
      }
      if (e.key === "Enter" && !e.shiftKey && p !== "capturing") {
        if (inEditable) return;
        e.preventDefault();
        if (p === "idle" || p === "error") actionsRef.current.runOptimize();
        // Compose mode (m === "empty") has no frozen inject target — Enter copies instead.
        else if (p === "done") (failed ? actionsRef.current.onCopy : actionsRef.current.onApply)();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const busy = phase === "optimizing" || isRevealing;
  const capturing = phase === "capturing";
  const captureFailed = mode === "empty";
  const canRefine = !capturing && !!prompt.trim() && !busy;
  const showOutput = busy || phase === "done" || phase === "error";
  const outputValue = busy ? displayed : outputText;
  const canCopy = !!outputText.trim() && phase === "done";
  // Compose mode has no frozen inject target — Copy is the terminal action, Apply stays off.
  const canApply = canCopy && !captureFailed;
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const controlsDisabled = capturing || busy;

  const outputPlaceholder = capturing
    ? "Capturing…"
    : busy
      ? "Refining…"
      : contextStatusPlaceholder(activeSession, Boolean(standingProjectContext.trim()));

  const keyMissingError = phase === "error" && outputText.includes("API key not configured");
  const phaseAnnouncement = capturing
    ? "Capturing…"
    : busy
      ? "Refining…"
      : phase === "done"
        ? "Done — output ready"
        : phase === "error"
          ? outputText
          : "";

  useEffect(() => {
    const el = outputRef.current;
    if (el && busy) el.scrollTop = el.scrollHeight;
  }, [displayed, busy]);

  return (
    <div className="overlay-font w-full h-full flex items-center justify-center px-12">
      <div className="sr-only" aria-live="polite">
        {phaseAnnouncement}
      </div>
      <div className={`relative w-full max-w-[578px] ${shellVisible ? "" : "invisible"}`}>
        {/* Folder tabs — tucked behind the card (z-0 under the card's z-10) for depth. */}
        <div
          className="apple-glass-tab apple-glass-tab--left -left-[26px] top-1/2 -translate-y-1/2 w-[36px] h-[158px] flex items-center justify-start pl-[7px]"
          aria-hidden
        >
          <span className="overlay-wordmark text-[10px] uppercase font-medium text-white/55 select-none">
            PromptForge
          </span>
        </div>
        <div ref={menuRef} className="absolute -right-[26px] top-6 z-20">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-0 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 flex items-start gap-2">
              <div className="flex flex-col gap-2 shrink-0 w-[168px]">
                <button
                  type="button"
                  onClick={() => void onNewSession()}
                  className="apple-glass-menu w-full rounded-xl py-2 px-3 text-sm text-center text-white hover:bg-white/10"
                >
                  + New session
                </button>
                <button
                  type="button"
                  onClick={() => void onClearSession()}
                  disabled={!activeSession?.contextText.trim()}
                  className="apple-glass-menu w-full rounded-xl py-2 px-3 text-sm text-center text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear session
                </button>
                {sessions.length > 0 && (
                  <div className="apple-glass-menu w-full rounded-xl py-1 text-white">
                    <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-white/50">
                      Sessions
                    </div>
                    {sessions.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center gap-0.5 pr-1">
                        <button
                          type="button"
                          onClick={() => void onResumeSession(s.id)}
                          className={`min-w-0 flex-1 text-left px-3 py-1.5 text-[13px] truncate hover:bg-white/10 ${
                            s.id === activeSession?.id ? "text-white" : "text-white/60"
                          }`}
                          title={s.title}
                        >
                          {s.id === activeSession?.id ? "• " : ""}
                          {s.title}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteSession(s.id);
                          }}
                          className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition"
                          aria-label="Delete session"
                          title="Delete session"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="apple-glass-menu min-w-[180px] rounded-xl py-2 text-white">
              <div className="px-3 pb-2">
                <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">Position</div>
                <OverlayPlacementPicker value={overlayPlacement} onChange={onPlacementChange} />
              </div>
              <div className="border-t border-white/10 my-1" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setImportPromptCopied(false);
                  setContextSaved(false);
                  setContextImportScope("session");
                  // Prefill from the store so the modal doubles as the editor.
                  setImportedSessionContext(activeSession?.contextText ?? "");
                  setImportedProjectContext(standingProjectContext);
                  void api.projectContextGet().then((text) => {
                    setStandingProjectContext(text);
                    setImportedProjectContext(text);
                  });
                  setContextModalOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Configure context
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  api.openSettings();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  api.openStudioWorkbench({
                    originalText: prompt,
                    optimizedText: outputText.trim() ? outputText : undefined,
                    model,
                    level,
                  });
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Open in Studio
              </button>
              <button
                type="button"
                onClick={() => api.hideOverlay()}
                className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                Dismiss
              </button>
              </div>
            </div>
          )}
        </div>

        <div className="apple-glass relative z-10 rounded-[34px] w-full p-4 text-white">
          <>
            <div className="flex gap-4 mb-4 items-start">
              <div className="flex-1 flex flex-col gap-3">
                <div className="apple-glass-panel rounded-[26px] h-[88px] overflow-hidden">
                  <textarea
                    ref={promptRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    readOnly={busy || capturing}
                    aria-label="Original prompt"
                    placeholder={capturing ? "Capturing…" : "Prompt input…"}
                    className="w-full h-full bg-transparent border-0 px-3.5 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/50 resize-none focus:outline-none scroll-thin"
                  />
                </div>
                <div className="pl-1 mt-1 flex items-center gap-3">
                  <GlassPill onClick={() => void runOptimize()} disabled={!canRefine}>
                    {busy ? "Refining…" : hasGenerated ? "Regenerate" : "Generate"}
                  </GlassPill>
                  <LevelSlider
                    level={level}
                    onChange={setLevel}
                    disabled={controlsDisabled}
                    labels={segmentMode === "writing" ? writingLevelLabels(writingType) : LEVEL_LABELS}
                  />
                </div>
              </div>

              <div
                className={`flex-1 apple-glass-panel relative rounded-[26px] h-[150px] overflow-hidden ${
                  phase === "error" ? "ring-1 ring-warn/50" : busy ? "ring-1 ring-white/20" : ""
                }`}
              >
                <textarea
                  ref={outputRef}
                  value={showOutput ? outputValue : ""}
                  onChange={(e) => {
                    const next = isTerminalSession ? toTerminalSingleLine(e.target.value) : e.target.value;
                    setOutputText(next);
                  }}
                  onKeyDown={(e) => {
                    if (isTerminalSession && e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                    }
                  }}
                  readOnly={busy || capturing || phase === "error"}
                  aria-label="Refined prompt output"
                  placeholder={outputPlaceholder}
                  className="w-full h-full bg-transparent border-0 px-3.5 py-3 pr-2 text-[15px] leading-relaxed text-white placeholder:text-white/50 resize-none focus:outline-none scroll-thin"
                />
                {busy && displayed.length > 0 && (
                  <span
                    className="pointer-events-none absolute bottom-3 right-3 text-[15px] text-white/70 animate-pulse"
                    aria-hidden
                  >
                    ▋
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 px-1 min-h-[36px]">
              <div className="flex items-center gap-3 min-w-0">
                {segmentMode === "prompting" ? (
                  <ModelPicker model={model} onChange={setModel} disabled={controlsDisabled} />
                ) : (
                  <WritingTypePicker value={writingType} onChange={setWritingType} disabled={controlsDisabled} />
                )}
                <ModeSegmentPill value={segmentMode} onChange={setSegmentMode} disabled={controlsDisabled} />
                <span className="sr-only">{modelLabel}</span>
                {applyNotice && (
                  <span className="text-[13px] text-warn truncate" role="status">
                    {applyNotice}
                  </span>
                )}
                {keyMissingError && (
                  <button
                    type="button"
                    onClick={() => api.openSettings()}
                    className="text-[13px] text-warn underline underline-offset-2 hover:opacity-80 transition shrink-0"
                  >
                    Open Settings →
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => api.hideOverlay()}
                  className="text-[15px] text-white/45 hover:text-white/65 transition shrink-0 -ml-1.5"
                >
                  Discard
                </button>
                <GlassPill onClick={onApply} disabled={!canApply}>
                  Apply
                </GlassPill>
                <GlassPill onClick={() => void onCopy()} disabled={!canCopy}>
                  Copy
                </GlassPill>
              </div>
            </div>
          </>
        </div>
      </div>

      {newSessionPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              setPendingDeleteProject(null);
              setNewSessionPickerOpen(false);
            }
          }}
        >
          <div className="apple-glass-menu relative w-full max-w-[360px] rounded-[24px] p-5 text-white">
            {pendingDeleteProject ? (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-[16px] font-medium">Delete project?</h2>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteProject(null)}
                    className="text-white/50 hover:text-white transition shrink-0"
                    aria-label="Close"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p className="text-[13px] text-white/70 mb-1 leading-relaxed">
                  <span className="text-white">{pendingDeleteProject.title}</span> will be permanently
                  removed.
                </p>
                {(() => {
                  const linkedCount = sessions.filter(
                    (s) => s.projectId === pendingDeleteProject.id,
                  ).length;
                  return linkedCount > 0 ? (
                    <p className="text-[13px] text-white/55 mb-4 leading-relaxed">
                      This also deletes {linkedCount} linked session
                      {linkedCount === 1 ? "" : "s"}.
                    </p>
                  ) : (
                    <p className="text-[13px] text-white/55 mb-4 leading-relaxed">
                      No linked sessions will be affected.
                    </p>
                  );
                })()}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteProject(null)}
                    className="rounded-xl px-3.5 py-2 text-[13px] text-white/70 hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void onConfirmDeleteProject()}
                    className="rounded-xl px-3.5 py-2 text-[13px] bg-white/15 hover:bg-white/25 text-white transition"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[16px] font-medium">Start with project context?</h2>
              <button
                type="button"
                onClick={() => setNewSessionPickerOpen(false)}
                className="text-white/50 hover:text-white transition shrink-0"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div
              className="mb-1 max-h-[200px] overflow-y-auto scroll-thin rounded-xl border border-white/10 bg-black/30 p-1"
              role="listbox"
              aria-label="Project"
            >
              <button
                type="button"
                role="option"
                onClick={() => void onStartNewSession(null)}
                className="w-full text-left rounded-lg px-3 py-2 text-[13px] transition text-white/70 hover:bg-white/10 hover:text-white"
              >
                No project
              </button>
              {pickerProjects.map((p) => (
                <div key={p.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    role="option"
                    onClick={() => void onStartNewSession(p.id)}
                    className="min-w-0 flex-1 text-left rounded-lg px-3 py-2 text-[13px] transition truncate text-white/70 hover:bg-white/10 hover:text-white"
                    title={p.title}
                  >
                    {p.title}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteProject(p);
                    }}
                    className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition"
                    aria-label={`Delete project ${p.title}`}
                    title="Delete project"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setNewSessionPickerOpen(false)}
                className="rounded-xl px-3.5 py-2 text-[13px] text-white/70 hover:bg-white/10 transition"
              >
                Cancel
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {contextModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setContextModalOpen(false);
          }}
        >
          <div className="apple-glass-menu relative w-full max-w-[480px] rounded-[24px] p-5 text-white">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[16px] font-medium">Import context to ANVYL.ai</h2>
              <button
                type="button"
                onClick={() => setContextModalOpen(false)}
                className="text-white/50 hover:text-white transition shrink-0"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="relative">
              <div
                className="pointer-events-none absolute left-[1px] top-[26px] bottom-[132px] w-px bg-white/35"
                aria-hidden
              />

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2 -ml-1.5">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-black text-[11px] shrink-0">
                    1
                  </span>
                  <span className="text-[13px] text-white/80">
                    Copy this prompt into a chat with your other AI provider
                  </span>
                </div>
                <div className="relative mx-3 rounded-xl bg-black/25 border border-white/10">
                  <div className="h-[88px] overflow-y-auto scroll-thin px-3.5 py-3 pr-[72px] text-[13px] leading-relaxed text-white/70 whitespace-pre-wrap select-text">
                    {contextImportPromptFor(contextImportScope)}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onCopyImportPrompt()}
                    className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition px-2.5 py-1.5 text-[12px] text-white"
                  >
                    {importPromptCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2 -ml-1.5">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-black text-[11px] shrink-0">
                    2
                  </span>
                  <span className="text-[13px] text-white/80">
                    {contextImportScope === "project"
                      ? "Paste results below to add to the Project's context"
                      : "Paste results below to add to the Session's context"}
                  </span>
                </div>
                <div className="mx-3">
                  <textarea
                    value={
                      contextImportScope === "project" ? importedProjectContext : importedSessionContext
                    }
                    onChange={(e) => {
                      if (contextImportScope === "project") setImportedProjectContext(e.target.value);
                      else setImportedSessionContext(e.target.value);
                    }}
                    placeholder="Paste your context details here"
                    maxLength={SESSION_CONTEXT_MAX_CHARS}
                    className="w-full h-[88px] rounded-xl bg-black/25 border border-white/10 px-3.5 py-3 text-[13px] leading-relaxed text-white placeholder:text-white/40 resize-none focus:outline-none scroll-thin"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <div className="translate-y-[2px]">
                <ContextScopePill
                  value={contextImportScope}
                  onChange={onContextImportScopeChange}
                  sessionConfigured={Boolean(importedSessionContext.trim())}
                  projectConfigured={Boolean(importedProjectContext.trim())}
                />
              </div>
              <button
                type="button"
                onClick={() => setContextModalOpen(false)}
                className="rounded-xl px-3.5 py-2 text-[13px] text-white/70 hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onAddToContext()}
                className="rounded-xl px-3.5 py-2 text-[13px] bg-white/15 hover:bg-white/25 transition"
              >
                {contextSaved ? "Added" : "Add to context"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
