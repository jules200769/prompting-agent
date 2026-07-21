import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { api } from "../api";
import { useTypewriterReveal } from "../hooks/useTypewriterReveal";
import type { CaptureContext, CaptureMode, ModelId, OptimizeGrounding, OptLevel, OverlayPlacement, PromptType } from "../../shared/types";
import { MODELS, LEVEL_LABELS, LEVEL_COLORS } from "../../shared/types";
import { toTerminalSingleLine, stripTerminalStreamChunk } from "../../shared/terminalOutput";
import {
  type ContextImportScope,
  contextImportPromptFor,
} from "../../shared/contextImportPrompt";
import { NEW_SESSION_TITLE, SESSION_CONTEXT_MAX_CHARS, type ProjectContext, type SessionContext } from "../../shared/session";
import { OverlayPlacementPicker } from "../components/OverlayPlacementPicker";
import { ModelPicker } from "../components/ModelPicker";
import { WritingTypePicker, type WritingType, writingLevelLabels } from "../components/WritingTypePicker";
import { ContextPanel } from "../components/ContextPanel";
import { applyThemeToDocument } from "../../shared/themes";

type Phase = "idle" | "capturing" | "optimizing" | "done" | "error";
type CaptureGlow = "off" | "active";

function MenuLinesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  lockedScope,
  lockedLabelDetail,
}: {
  value: ContextImportScope;
  onChange: (scope: ContextImportScope) => void;
  sessionConfigured: boolean;
  projectConfigured: boolean;
  /** When set, only that scope is shown as a non-interactive label. */
  lockedScope?: ContextImportScope;
  /** Optional target name appended to the locked label (e.g. session/project title). */
  lockedLabelDetail?: string;
}) {
  const options = (
    [
      { id: "session", label: "Session", configured: sessionConfigured },
      { id: "project", label: "Project", configured: projectConfigured },
    ] as const
  ).filter((option) => !lockedScope || option.id === lockedScope);
  const locked = Boolean(lockedScope);

  return (
    <div
      className="inline-flex items-center rounded-full p-0.5 bg-white/10 border border-white/15 shrink-0"
      role="group"
      aria-label="Context scope"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={locked}
          onClick={() => {
            if (locked) return;
            onChange(option.id);
          }}
          aria-label={
            option.configured ? `${option.label}, configured` : `${option.label}, not configured`
          }
          className={`h-6 px-2.5 rounded-full text-[12px] font-medium leading-none inline-flex items-center justify-center transition ${
            value === option.id
              ? "bg-white/25 text-white shadow-sm"
              : "text-white/55 hover:text-white/75"
          } ${locked ? "cursor-default disabled:opacity-100" : ""}`}
        >
          <span className="inline-flex items-center gap-1.5 translate-y-px">
            {option.configured ? (
              <span className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" aria-hidden />
            ) : null}
            {locked && lockedLabelDetail ? `${option.label} — ${lockedLabelDetail}` : option.label}
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
  if (!sessionOn && !projectOn) {
    return "No context yet — add a session or project so refinements understand your work.";
  }
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
  accent,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${accent ? "apple-glass-pill--accent" : "apple-glass-pill"} px-5 py-1.5 rounded-full text-[15px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * One-line context bar atop the overlay card: project dot + name / session
 * title + chevron. Always rendered (no appearance animation) so the shell shows
 * instantly; opens the unified context surface on click.
 */
function ContextBar({
  project,
  session,
  open,
  onClick,
  disabled,
}: {
  project: ProjectContext | null;
  session: SessionContext | null;
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const projectName = project?.title ?? "No project";
  const sessionTitle = session ? session.title : "No session";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Context: ${projectName} / ${sessionTitle}`}
      className="group flex w-full items-center gap-2 h-7 px-2 -mx-1 mb-2 rounded-[10px] hover:bg-white/[.06] transition text-[13px] min-w-0 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: project?.color ?? "rgba(255,255,255,.25)" }}
        aria-hidden
      />
      <span className="shrink-0 max-w-[40%] truncate text-white/45">{projectName}</span>
      <span className="shrink-0 text-white/30" aria-hidden>
        /
      </span>
      <span className="min-w-0 flex-1 truncate text-white font-medium">{sessionTitle}</span>
      <span
        className={`ml-auto shrink-0 text-white/40 text-[11px] transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      >
        ▾
      </span>
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
  /** Context layers that grounded the last completed refine — drives the chip row. */
  const [lastGrounding, setLastGrounding] = useState<OptimizeGrounding | null>(null);
  /** Anvyll summary detected on the clipboard at capture — drives the consent toast. */
  const [clipboardSummary, setClipboardSummary] = useState<{
    scope: ContextImportScope;
    text: string;
  } | null>(null);
  const [clipboardSummaryAdded, setClipboardSummaryAdded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Visual-only capture-wait glow; exits with a short fade after phase leaves capturing. */
  const [captureGlow, setCaptureGlow] = useState<CaptureGlow>("off");
  const [shellVisible, setShellVisible] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [terminalContext, setTerminalContext] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  /** True when "Bring context" was opened from "+ New Project" (project scope locked). */
  const [newProjectFlow, setNewProjectFlow] = useState(false);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectContext | null>(null);
  const [contextImportScope, setContextImportScope] = useState<ContextImportScope>("session");
  /** Non-active project targeted by the "memory" editor; null = active-project/session path. */
  const [importTargetProjectId, setImportTargetProjectId] = useState<string | null>(null);
  const [importedSessionContext, setImportedSessionContext] = useState("");
  const [importedProjectContext, setImportedProjectContext] = useState("");
  /** Persisted standing project context — drives the empty-output status hint. */
  const [standingProjectContext, setStandingProjectContext] = useState("");
  const [importPromptCopied, setImportPromptCopied] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionContext | null>(null);
  const [sessions, setSessions] = useState<SessionContext[]>([]);
  /** Full project library snapshot — drives the context bar, panel, and session-row accents. */
  const [projects, setProjects] = useState<ProjectContext[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const captureRef = useRef<{
    text: string;
    mode: CaptureMode;
    snapshot: { text: string; hasText: boolean };
    terminalContext?: boolean;
    context?: CaptureContext;
  } | null>(null);
  const defaultModelRef = useRef<ModelId>("claude-opus-4.8");
  const shellRef = useRef<HTMLDivElement>(null);
  const copyAnchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const contextPanelRef = useRef<HTMLDivElement>(null);
  const contextBarRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const keyStateRef = useRef({
    mode,
    phase,
    captureFailed: false,
    panelOpen: false,
    modalOpen: false,
    newProjectFlow: false,
  });
  const actionsRef = useRef<{ runOptimize: () => void; onApply: () => void; onCopy: () => void }>({
    runOptimize: () => {},
    onApply: () => {},
    onCopy: () => {},
  });
  const lastRunIdRef = useRef<string | null>(null);
  const resumeContextModalRef = useRef(false);
  /** Text of the last dismissed clipboard summary — suppresses repeat toasts (in-memory only). */
  const lastDismissedSummaryRef = useRef<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPos = useCallback(() => {
    const anchor = copyAnchorRef.current;
    const shell = shellRef.current;
    if (!anchor || !shell) return;
    const anchorRect = anchor.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    setMenuPos({
      top: anchorRect.bottom - shellRect.top + 6,
      left: anchorRect.left - shellRect.left + anchorRect.width / 2,
    });
  }, []);

  useLayoutEffect(() => {
    updateMenuPos();
    const shell = shellRef.current;
    if (!shell) return;
    const ro = new ResizeObserver(updateMenuPos);
    ro.observe(shell);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [updateMenuPos, shellVisible, phase, segmentMode, contextPanelOpen, lastGrounding]);

  useEffect(() => {
    if (menuOpen) updateMenuPos();
  }, [menuOpen, updateMenuPos]);

  keyStateRef.current = {
    mode,
    phase,
    captureFailed: mode === "empty",
    panelOpen: contextPanelOpen,
    modalOpen: contextModalOpen,
    newProjectFlow,
  };

  const isTerminalSession = mode === "terminal" || terminalContext;

  function ackOverlayPrepared(): void {
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      api.overlayPrepared();
    });
  }

  /**
   * One round-trip that resyncs every context surface (bar, panel, menu rows).
   * The store is a local JSON doc, so four IPC calls per hotkey/mutation is
   * negligible — cheaper than tracking five states independently.
   */
  function refreshContextSnapshot(): void {
    void Promise.all([
      api.sessionGetActive(),
      api.projectContextGet(),
      api.sessionList(),
      api.projectList(),
    ]).then(([active, projText, sessionList, { projects: projectList, activeProjectId: activeProj }]) => {
      setActiveSession(active);
      setStandingProjectContext(projText);
      setSessions(sessionList);
      setProjects(projectList);
      setActiveProjectId(activeProj);
    });
  }

  function closeContextModal(opts?: { returnToContextPanel?: boolean }): void {
    const returnToPanel = opts?.returnToContextPanel ?? false;
    resumeContextModalRef.current = false;
    setNewProjectFlow(false);
    setImportTargetProjectId(null);
    setContextModalOpen(false);
    if (returnToPanel) {
      setPendingDeleteProject(null);
      setContextPanelOpen(true);
    }
  }

  function clearCaptureGlow(): void {
    setCaptureGlow("off");
  }

  function resetOverlaySession(): void {
    flushSync(() => {
      captureRef.current = null;
      setMode("field");
      setPrompt("");
      setPhase("idle");
      clearCaptureGlow();
      resetTypewriter();
      setOutputText("");
      setHasGenerated(false);
      setLastGrounding(null);
      lastRunIdRef.current = null;
      setMenuOpen(false);
      setApplyNotice(null);
      setTerminalContext(false);
      setPromptType("auto");
      setSegmentMode("prompting");
      setWritingType("question");
      setShellVisible(false);
      setContextModalOpen(false);
      setContextPanelOpen(false);
      setContextSaved(false);
      setImportPromptCopied(false);
      setClipboardSummary(null);
      setClipboardSummaryAdded(false);
    });
    refreshContextSnapshot();
    ackOverlayPrepared();
  }

  useEffect(() => {
    (async () => {
      const s = await api.settingsGet();
      defaultModelRef.current = s.defaultModel;
      setModel(s.defaultModel);
      setLevel(s.defaultLevel);
      setOverlayPlacement(s.overlayPlacement);
      applyThemeToDocument(s.theme, { overlay: true });
    })();
    const offTheme = api.onSettingsChanged((theme) => {
      applyThemeToDocument(theme, { overlay: true });
    });
    // Restore the persisted active session + project context (survives app restarts).
    refreshContextSnapshot();

    const applyCapture = (detail: {
      text: string;
      mode: CaptureMode;
      snapshot: { text: string; hasText: boolean };
      terminalContext?: boolean;
      context?: CaptureContext;
      clipboardSummary?: { scope: ContextImportScope; text: string };
    }) => {
      // The first empty OVERLAY_SHOW is the instant shell displayed while native
      // capture is still running. The following delivery replaces it with the
      // actual capture, without changing any capture orchestration or timing.
      const isWaitingForCapture =
        !window.__anvyllMock &&
        captureRef.current === null &&
        detail.text === "" &&
        detail.mode === "field" &&
        !detail.context;
      // A detected summary supersedes the auto-reopen: show the toast instead of the
      // modal (trusting the actually-detected scope). Suppress a summary the user just
      // dismissed. If the resume flow is set but nothing matched, keep the manual reopen.
      const summary = detail.clipboardSummary ?? null;
      const suppressed = summary != null && summary.text === lastDismissedSummaryRef.current;
      const showToast = summary != null && !suppressed;
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
        setPhase(isWaitingForCapture ? "capturing" : "idle");
        resetTypewriter();
        setOutputText("");
        setHasGenerated(false);
        setLastGrounding(null);
        lastRunIdRef.current = null;
        setMenuOpen(false);
        setApplyNotice(null);
        setShellVisible(true);
        setContextModalOpen(resumeContextModalRef.current && !showToast);
        setContextPanelOpen(false);
        setContextSaved(false);
        setImportPromptCopied(false);
        setClipboardSummary(showToast ? summary : null);
        setClipboardSummaryAdded(false);
      });
      refreshContextSnapshot();
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
      lastRunIdRef.current = null;
      setMenuOpen(false);
      setApplyNotice(null);
      ackOverlayPrepared();
    };

    const offPending = api.onOverlayCapturePending(onCapturePending);
    const offShow = api.onOverlayShow(applyCapture);
    const offClear = api.onOverlayClear(resetOverlaySession);
    return () => {
      offTheme?.();
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

  // Outside-click closes the context panel; a click on the bar itself is a toggle.
  useEffect(() => {
    if (!contextPanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (contextPanelRef.current?.contains(target)) return;
      if (contextBarRef.current?.contains(target)) return;
      setContextPanelOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [contextPanelOpen]);

  // Cheap re-sync of the full context snapshot whenever a context surface opens.
  useEffect(() => {
    if (menuOpen || contextPanelOpen) refreshContextSnapshot();
  }, [menuOpen, contextPanelOpen]);

  // Mutual exclusion: only one of the ⋮ menu / context panel is open at a time.
  function toggleContextPanel(): void {
    setContextPanelOpen((v) => {
      const next = !v;
      if (next) setMenuOpen(false);
      return next;
    });
  }

  function toggleMenu(): void {
    setMenuOpen((v) => {
      const next = !v;
      if (next) setContextPanelOpen(false);
      return next;
    });
  }

  function onBackdropPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (shellRef.current?.contains(e.target as Node)) return;
    if (contextModalOpen) return;
    if (contextPanelOpen) {
      setContextPanelOpen(false);
      return;
    }
    api.hideOverlay();
  }

  /** One-click: pick a project (or none) and start the session immediately. */
  async function onNewSessionIn(projectId: string | null) {
    const session = await api.sessionCreate(projectId);
    setActiveSession(session);
    if (!projectId) {
      await api.projectSetActive(null);
      setStandingProjectContext("");
      setImportedProjectContext("");
    } else {
      const chosen = projects.find((p) => p.id === projectId);
      const activated = await api.projectSetActive(projectId);
      const text = activated?.contextText ?? chosen?.contextText ?? "";
      setStandingProjectContext(text);
      setImportedProjectContext(text);
    }
    setPendingDeleteProject(null);
    refreshContextSnapshot();
  }

  /** Panel "+ Project": open "Bring context" locked to project; creates a new project + session on save. */
  function onNewProject(): void {
    setContextPanelOpen(false);
    setPendingDeleteProject(null);
    setImportPromptCopied(false);
    setContextSaved(false);
    setContextImportScope("project");
    setImportTargetProjectId(null);
    setImportedProjectContext("");
    setNewProjectFlow(true);
    setContextModalOpen(true);
  }

  /** Panel "Bring context": open "Bring context" locked to the active session. */
  function onBringContext(): void {
    setContextPanelOpen(false);
    setPendingDeleteProject(null);
    setImportPromptCopied(false);
    setContextSaved(false);
    setContextImportScope("session");
    setImportTargetProjectId(null);
    setNewProjectFlow(false);
    setImportedSessionContext(activeSession?.contextText ?? "");
    setContextModalOpen(true);
  }

  /** Panel per-project "memory": open "Bring context" locked to that project (non-active safe). */
  function onEditProjectMemory(project: ProjectContext): void {
    setContextPanelOpen(false);
    setPendingDeleteProject(null);
    setImportPromptCopied(false);
    setContextSaved(false);
    setContextImportScope("project");
    setImportTargetProjectId(project.id);
    setNewProjectFlow(false);
    setImportedProjectContext(project.contextText);
    setContextModalOpen(true);
  }

  async function onConfirmDeleteProject() {
    if (!pendingDeleteProject) return;
    const id = pendingDeleteProject.id;
    await api.projectDelete(id);
    const stillActive = await api.projectContextGet();
    if (!stillActive.trim()) setImportedProjectContext("");
    setPendingDeleteProject(null);
    refreshContextSnapshot();
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
    refreshContextSnapshot();
  }

  async function onDeleteSession(id: string) {
    await api.sessionDelete(id);
    if (activeSession?.id === id) {
      setActiveSession(await api.sessionGetActive());
    }
    refreshContextSnapshot();
  }

  async function onAddToContext() {
    if (contextImportScope === "project") {
      if (importTargetProjectId && importTargetProjectId !== activeProjectId) {
        // Editing a non-active project's memory — never touch the active pointer.
        const updated = await api.projectSetContextById(importTargetProjectId, importedProjectContext);
        if (updated) setImportedProjectContext(updated.contextText);
      } else {
        // Clear active first so upsert creates a fresh library entry (not an overwrite).
        if (newProjectFlow) {
          await api.projectSetActive(null);
        }
        const project = await api.projectUpsertActive(importedProjectContext);
        setStandingProjectContext(project.contextText);
        setImportedProjectContext(project.contextText);
        if (newProjectFlow) {
          setActiveSession(await api.sessionCreate(project.id));
          setNewProjectFlow(false);
        }
      }
    } else {
      const target = activeSession ?? (await api.sessionCreate());
      setActiveSession(await api.sessionSetContext(target.id, importedSessionContext));
    }
    refreshContextSnapshot();
    setContextSaved(true);
    window.setTimeout(() => {
      setContextSaved(false);
      closeContextModal();
    }, 900);
  }

  async function onConfirmClipboardSummary() {
    if (!clipboardSummary) return;
    const { scope, text } = clipboardSummary;
    if (scope === "session") {
      const target = activeSession ?? (await api.sessionCreate());
      setActiveSession(await api.sessionSetContext(target.id, text));
    } else {
      const project = await api.projectUpsertActive(text);
      setStandingProjectContext(project.contextText);
    }
    refreshContextSnapshot();
    resumeContextModalRef.current = false;
    setClipboardSummaryAdded(true);
    window.setTimeout(() => {
      setClipboardSummaryAdded(false);
      setClipboardSummary(null);
    }, 900);
  }

  function onDismissClipboardSummary() {
    if (clipboardSummary) lastDismissedSummaryRef.current = clipboardSummary.text;
    resumeContextModalRef.current = false;
    setClipboardSummary(null);
  }

  async function runOptimize() {
    if (!prompt.trim()) return;
    const sessionIdForTitle = activeSession?.id;
    const shouldTitleFromPrompt = activeSession?.title === NEW_SESSION_TITLE;
    setApplyNotice(null);
    resetTypewriter();
    setPhase("optimizing");
    setOutputText("");
    setLastGrounding(null);
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
      lastRunIdRef.current = res.runId;
      const refined = isTerminalSession ? toTerminalSingleLine(res.optimizedPrompt) : res.optimizedPrompt;
      setTarget(refined);
      await waitUntilRevealed();
      setOutputText(refined);
      setLastGrounding(res.grounding ?? null);
      setHasGenerated(true);
      setPhase("done");
      if (sessionIdForTitle && shouldTitleFromPrompt) {
        const updated = await api.sessionMaybeTitleFromPrompt(sessionIdForTitle, prompt);
        if (updated) {
          setActiveSession(updated);
          setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        }
      }
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
    void api.historyFinalize({ id: lastRunIdRef.current ?? undefined, finalPrompt: text, action: "apply" });
    const res = await api.captureInject(text, captureRef.current?.snapshot ?? { text: "", hasText: false });
    if (res === "copied") {
      setApplyNotice("Couldn't insert — copied to clipboard");
    }
  }

  async function onCopy() {
    if (!outputText.trim()) return;
    const text = isTerminalSession ? toTerminalSingleLine(outputText) : outputText;
    void api.historyFinalize({ id: lastRunIdRef.current ?? undefined, finalPrompt: text, action: "copy" });
    await api.captureCopy(text);
  }

  async function onCopyImportPrompt() {
    await api.captureCopy(contextImportPromptFor(contextImportScope));
    resumeContextModalRef.current = true;
    setImportPromptCopied(true);
    api.hideOverlay();
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
      const {
        mode: m,
        phase: p,
        captureFailed: failed,
        panelOpen,
        modalOpen,
        newProjectFlow: modalFromNewProject,
      } = keyStateRef.current;
      const tag = (e.target as HTMLElement).tagName;
      const inEditable = tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT";
      if (e.key === "Escape") {
        // Close the topmost surface first (panel/import modal), then the overlay.
        if (modalOpen) {
          closeContextModal({ returnToContextPanel: modalFromNewProject });
          return;
        }
        if (panelOpen) {
          setContextPanelOpen(false);
          return;
        }
        api.hideOverlay();
        return;
      }
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

  // The bar names the active session, so its project is the truthful lookup key;
  // fall back to the standalone active project only when no session is active.
  const activeProject = activeSession?.projectId
    ? projects.find((p) => p.id === activeSession.projectId) ?? null
    : activeProjectId
      ? projects.find((p) => p.id === activeProjectId) ?? null
      : null;

  // Names the locked scope target in the import modal's pill-as-label.
  const lockedScopeDetail =
    contextImportScope === "session"
      ? activeSession?.title ?? NEW_SESSION_TITLE
      : newProjectFlow
        ? "New project"
        : (importTargetProjectId
            ? projects.find((p) => p.id === importTargetProjectId)?.title
            : activeProject?.title) ?? "Project";

  const busy = phase === "optimizing" || isRevealing;
  const capturing = phase === "capturing";
  const captureGlowOn = captureGlow === "active";
  const captureFailed = mode === "empty";

  useEffect(() => {
    setCaptureGlow(capturing ? "active" : "off");
  }, [capturing]);
  const canRefine = !capturing && !!prompt.trim() && !busy;
  const showOutput = busy || phase === "done" || phase === "error";
  const outputValue = busy ? displayed : outputText;
  const canCopy = !!outputText.trim() && phase === "done";
  // Compose mode has no frozen inject target — Copy is the terminal action, Apply stays off.
  const canApply = canCopy && !captureFailed;
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const controlsDisabled = capturing || busy;

  const outputPlaceholder = busy
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
    <div
      className="overlay-font w-full h-full flex items-center justify-center px-4 py-4"
      onPointerDown={onBackdropPointerDown}
    >
      <div className="sr-only" aria-live="polite">
        {phaseAnnouncement}
      </div>
      <div ref={shellRef} className={`overlay-shell relative w-full max-w-[578px] ${shellVisible ? "" : "invisible"}`}>
        <div className="overlay-ambient" aria-hidden />
        {/* Folder tabs — tucked behind the card (z-0 under the card's z-10) for depth. */}
        <div
          className="apple-glass-tab apple-glass-tab--left -left-[26px] top-1/2 -translate-y-1/2 w-[36px] h-[158px] flex items-center justify-start pl-[7px]"
          aria-hidden
        >
          <span className="overlay-wordmark text-[10px] font-bold select-none">
            ANVYLL.AI
          </span>
        </div>

        {contextPanelOpen && (
          <ContextPanel
            panelRef={contextPanelRef}
            projects={projects}
            sessions={sessions}
            activeSessionId={activeSession?.id ?? null}
            pendingDeleteProject={pendingDeleteProject}
            onResumeSession={(id) => void onResumeSession(id)}
            onDeleteSession={(id) => void onDeleteSession(id)}
            onNewSessionIn={(projectId) => void onNewSessionIn(projectId)}
            onRequestDeleteProject={setPendingDeleteProject}
            onConfirmDeleteProject={() => void onConfirmDeleteProject()}
            onNewProject={onNewProject}
            onBringContext={onBringContext}
            onEditProjectMemory={onEditProjectMemory}
            onClose={() => setContextPanelOpen(false)}
          />
        )}

        {captureGlowOn && (
          <div aria-hidden className="apple-glass-capture-aura" />
        )}
        <div
          className={`apple-glass overlay-chrome relative z-10 rounded-[34px] w-full p-4${
            captureGlowOn ? " apple-glass--capture-wait" : ""
          }`}
        >
          <>
            <div ref={contextBarRef}>
              <ContextBar
                project={activeProject}
                session={activeSession}
                open={contextPanelOpen}
                onClick={toggleContextPanel}
                disabled={capturing}
              />
            </div>
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
                    className="w-full h-full bg-transparent border-0 px-3.5 py-3 text-[15px] leading-relaxed text-[var(--overlay-ink)] placeholder:text-[var(--overlay-muted)] resize-none focus:outline-none scroll-thin"
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
                  className="w-full h-full bg-transparent border-0 px-3.5 py-3 pr-2 text-[15px] leading-relaxed text-[var(--overlay-ink)] placeholder:text-[var(--overlay-muted)] resize-none focus:outline-none scroll-thin"
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
                  <span className="text-[13px] text-white/45 truncate max-w-[220px]" role="status">
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
                <GlassPill accent onClick={onApply} disabled={!canApply}>
                  Apply
                </GlassPill>
                <div ref={copyAnchorRef} className="relative shrink-0">
                  <GlassPill onClick={() => void onCopy()} disabled={!canCopy}>
                    Copy
                  </GlassPill>
                </div>
              </div>
            </div>

            {/* Fixed min-height so the card never jumps when chips appear post-refine. */}
            <div className="min-h-[20px] mt-2 px-1 flex items-center gap-1.5 flex-wrap text-[11px] text-white/40">
              {phase === "done" &&
                lastGrounding &&
                (() => {
                  const chips: string[] = [];
                  if (lastGrounding.session) chips.push("Session");
                  if (lastGrounding.project) chips.push("Project");
                  if (lastGrounding.destination) {
                    const d = lastGrounding.destination;
                    chips.push(`${d.app}${d.detail ? ` · ${d.detail}` : ""}`);
                  }
                  if (chips.length === 0) {
                    return (
                      <button
                        type="button"
                        onClick={() => setContextPanelOpen(true)}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-px text-white/50 hover:text-white/70 transition"
                      >
                        No context
                      </button>
                    );
                  }
                  return (
                    <>
                      <span>Grounded by</span>
                      {chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-px text-white/70"
                        >
                          {chip}
                        </span>
                      ))}
                    </>
                  );
                })()}
            </div>
          </>
        </div>

        {menuPos && (
          <div
            ref={menuRef}
            className="absolute z-40 pointer-events-auto"
            style={{ top: menuPos.top, left: menuPos.left, transform: "translateX(-50%)" }}
          >
            <button
              type="button"
              onClick={toggleMenu}
              className="inline-flex items-center gap-1 px-2 py-1 min-h-[28px] rounded-full text-white/80 hover:text-white hover:bg-white/20 transition whitespace-nowrap"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MenuLinesIcon />
              <span className="text-[10px] uppercase font-medium text-white/55 select-none pointer-events-none">
                menu
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 z-50">
                <div className="apple-glass-menu min-w-[180px] rounded-xl py-2 text-white shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
                  <div className="px-3 pb-2">
                    <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">Position</div>
                    <OverlayPlacementPicker value={overlayPlacement} onChange={onPlacementChange} />
                  </div>
                  <div className="border-t border-white/10 my-1" />
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
        )}

        {clipboardSummary && (
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-12 z-30 apple-glass-menu rounded-full flex items-center gap-2 pl-4 pr-2 py-1.5 text-[13px] text-white whitespace-nowrap"
            role="status"
          >
            <span className="text-white/70">Summary found on clipboard</span>
            <button
              type="button"
              onClick={() => void onConfirmClipboardSummary()}
              disabled={clipboardSummaryAdded}
              className="rounded-full px-3 py-1 text-[12px] font-medium bg-white/20 hover:bg-white/30 text-white transition disabled:opacity-100"
            >
              {clipboardSummaryAdded
                ? "Added ✓"
                : clipboardSummary.scope === "project"
                  ? "Add to project memory"
                  : "Add to this session"}
            </button>
            <button
              type="button"
              onClick={onDismissClipboardSummary}
              className="shrink-0 p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {contextModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              closeContextModal({ returnToContextPanel: newProjectFlow });
            }
          }}
        >
          <div className="apple-glass-menu relative w-full max-w-[480px] rounded-[24px] p-5 text-white">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-[16px] font-medium">Bring context from your chat</h2>
              <button
                type="button"
                onClick={() => closeContextModal({ returnToContextPanel: newProjectFlow })}
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
                    Copy this prompt into your AI chat — your refinements will understand that
                    conversation.
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
                      ? "Paste the answer below — it becomes this project's memory"
                      : "Paste the answer below — it becomes this session's memory"}
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
                  onChange={() => {}}
                  sessionConfigured={Boolean(importedSessionContext.trim())}
                  projectConfigured={Boolean(importedProjectContext.trim())}
                  lockedScope={contextImportScope}
                  lockedLabelDetail={lockedScopeDetail}
                />
              </div>
              <button
                type="button"
                onClick={() => closeContextModal({ returnToContextPanel: newProjectFlow })}
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
