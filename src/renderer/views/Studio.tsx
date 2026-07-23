import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import anvyllLogo from "../../../assets/icon-source.png";
import {
  MODELS,
  type AppSettings,
  type WorkbenchSeed,
} from "../../shared/types";
import {
  STUDIO_PLANS,
  usagePercent,
  type Account,
  type Instruction,
  type StudioRoute,
  type Subscription,
  type UsageSummary,
} from "../../shared/studio";
import {
  NEW_SESSION_TITLE,
  type ProjectContext,
  type SessionContext,
} from "../../shared/session";
import { applyThemeToDocument } from "../../shared/themes";
import { api } from "../api";
import { spring, useReducedMotionSafe, viewTransition } from "../motion";
import { CommandPalette, type CommandItem } from "../components/CommandPalette";
import { ProjectRail } from "../components/ProjectRail";
import { ToastProvider } from "../components/Toast";
import { studioService } from "../services/studioServiceRuntime";
import { StudioLibrary } from "./studio/StudioLibrary";
import {
  StudioInstructions,
  StudioPlans,
  StudioTester,
} from "./studio/StudioProductViews";
import { StudioHistory, StudioSettings } from "./studio/StudioSystemViews";
import { StudioWorkbench } from "./studio/StudioWorkbench";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ route: StudioRoute; label: string; index: string }>;
}> = [
  {
    label: "Build",
    items: [
      { route: "generator", label: "Generator", index: "01" },
      { route: "optimizer", label: "Optimizer", index: "02" },
      { route: "tester", label: "Prompt Tester", index: "03" },
    ],
  },
  {
    label: "Organize",
    items: [
      { route: "library", label: "Library", index: "04" },
      { route: "instructions", label: "Instructions", index: "05" },
      { route: "history", label: "History", index: "06" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { route: "plans", label: "Plans & Usage", index: "07" },
      { route: "settings", label: "Settings", index: "08" },
    ],
  },
];

export function Studio() {
  return (
    <ToastProvider>
      <StudioShell />
    </ToastProvider>
  );
}

function StudioShell() {
  const [route, setRoute] = useState<StudioRoute>("generator");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [seed, setSeed] = useState<WorkbenchSeed | null>(null);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectContext[]>([]);
  const [sessions, setSessions] = useState<SessionContext[]>([]);
  const [activeSession, setActiveSession] = useState<SessionContext | null>(null);
  const { variants, reduce } = useReducedMotionSafe();

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeSession?.projectId) ?? null,
    [projects, activeSession],
  );

  async function refreshProductState() {
    const [nextAccount, nextSubscription, nextUsage, nextInstructions] = await Promise.all([
      studioService.getAccount(),
      studioService.getSubscription(),
      studioService.getUsage(),
      studioService.listInstructions(),
    ]);
    setAccount(nextAccount);
    setSubscription(nextSubscription);
    setUsage(nextUsage);
    setInstructions(nextInstructions);
  }

  const refreshContextTree = useCallback(async () => {
    const [{ projects: nextProjects }, nextSessions, nextActive] = await Promise.all([
      api.projectList(),
      api.sessionList(),
      api.sessionGetActive(),
    ]);
    // The store sorts by updatedAt and bumps it on activate, which would make a
    // clicked session jump to the top. Order the tree by createdAt instead so the
    // list stays put when you select a session; selection is shown by highlight.
    const byCreated = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;
    setProjects([...nextProjects].sort(byCreated));
    setSessions([...nextSessions].sort(byCreated));
    setActiveSession(nextActive);
  }, []);

  useEffect(() => {
    void api.settingsGet().then((loaded) => {
      setSettings(loaded);
      applyThemeToDocument(loaded.theme);
    });
    void refreshProductState();
    void refreshContextTree();
    const offRoute = api.onStudioRoute((nextRoute) => {
      if (nextRoute === "settings") setRoute("settings");
    });
    const offSeed = api.onStudioWorkbench((nextSeed) => {
      setSeed(nextSeed);
      setRoute("optimizer");
    });
    // The overlay writes to the same project/session store; re-pull when the
    // Studio window regains focus so its tree reflects overlay-made changes.
    const onFocus = () => void refreshContextTree();
    window.addEventListener("focus", onFocus);
    return () => {
      offRoute?.();
      offSeed?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshContextTree]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentPlan = useMemo(
    () => STUDIO_PLANS.find((plan) => plan.id === subscription?.planId),
    [subscription],
  );

  function openSeed(nextRoute: "generator" | "tester" | "optimizer", nextSeed: WorkbenchSeed) {
    setSeed(nextSeed);
    setRoute(nextRoute);
  }

  // Open a session in the Optimizer: activate it (so its context grounds
  // rewrites everywhere, including the overlay) and route to a blank optimizer
  // whose header shows the project/session path.
  async function openSession(session: SessionContext) {
    const activated = await api.sessionSetActive(session.id);
    await api.projectSetActive(session.projectId ?? null);
    setActiveSession(activated ?? session);
    setSeed(null);
    setRoute("optimizer");
    void refreshContextTree();
  }

  async function handleNewProject(name: string) {
    // projectUpsertActive titles the project from its context's first line, so
    // clear the active pointer first to force a fresh entry named after `name`.
    await api.projectSetActive(null);
    const project = await api.projectUpsertActive(name);
    const session = await api.sessionCreate(project.id);
    await api.sessionSetActive(session.id);
    setActiveSession(session);
    setRoute("optimizer");
    void refreshContextTree();
  }

  async function handleNewSession(projectId: string | null) {
    const session = await api.sessionCreate(projectId);
    await api.sessionSetActive(session.id);
    await api.projectSetActive(projectId);
    setActiveSession(session);
    setRoute("optimizer");
    void refreshContextTree();
  }

  async function handleDeleteSession(id: string) {
    await api.sessionDelete(id);
    if (activeSession?.id === id) setActiveSession(await api.sessionGetActive());
    void refreshContextTree();
  }

  // Auto-save: after a run, name the active session from the first prompt (or
  // create one if none is active) so the work shows up in the tree.
  async function handleRunComplete(prompt: string) {
    let session = activeSession ?? (await api.sessionGetActive());
    if (!session) {
      session = await api.sessionCreate(activeProject?.id ?? null);
      await api.sessionSetActive(session.id);
    }
    if (session.title === NEW_SESSION_TITLE) {
      const titled = await api.sessionMaybeTitleFromPrompt(session.id, prompt);
      if (titled) session = titled;
    }
    setActiveSession(session);
    void refreshContextTree();
  }

  const commandItems: CommandItem[] = useMemo(
    () =>
      NAV_GROUPS.flatMap((group) =>
        group.items.map((item) => ({
          id: item.route,
          label: item.label,
          group: group.label,
          index: item.index,
          onSelect: () => {
            setRoute(item.route);
            if (item.route === "plans") void refreshProductState();
          },
        })),
      ),
    [],
  );

  function renderRoute() {
    switch (route) {
      case "generator":
        return (
          <StudioWorkbench
            mode="generator"
            defaultSettings={settings}
            seed={seed}
            service={studioService}
            instructions={instructions}
            activeProject={activeProject}
            activeSession={activeSession}
            onRunComplete={handleRunComplete}
          />
        );
      case "optimizer":
        return (
          <StudioWorkbench
            mode="optimizer"
            defaultSettings={settings}
            seed={seed}
            service={studioService}
            instructions={instructions}
            activeProject={activeProject}
            activeSession={activeSession}
            onRunComplete={handleRunComplete}
          />
        );
      case "tester":
        return <StudioTester seed={seed} />;
      case "library":
        return <StudioLibrary service={studioService} onOpen={openSeed} />;
      case "instructions":
        return (
          <StudioInstructions service={studioService} instructions={instructions} onChange={setInstructions} />
        );
      case "history":
        return <StudioHistory onOpen={(nextSeed) => openSeed("optimizer", nextSeed)} />;
      case "plans":
        return <StudioPlans service={studioService} />;
      case "settings":
        return <StudioSettings />;
      default:
        return null;
    }
  }

  return (
    <div className="studio-app">
      <div className="studio-backdrop" aria-hidden="true" />
      <aside className="studio-sidebar">
        <div className="studio-sidebar__brand">
          <img src={anvyllLogo} alt="Anvyll" />
          <div>
            <strong>Anvyll</strong>
            <span>Prompt precision</span>
          </div>
        </div>

        {usage && currentPlan && (
          <button type="button" className="studio-sidebar__usage" onClick={() => setRoute("plans")}>
            <span>
              <strong>{currentPlan.name}</strong>
              <small>{usage.limit === null ? "Unlimited" : `${usagePercent(usage)}% used`}</small>
            </span>
            <div className="studio-sidebar__meter">
              <i style={{ width: usage.limit === null ? "18%" : `${usagePercent(usage)}%` }} />
            </div>
          </button>
        )}

        <div className="studio-sidebar__body scroll-thin">
          <ProjectRail
            projects={projects}
            sessions={sessions}
            activeSessionId={activeSession?.id ?? null}
            onOpenSession={(session) => void openSession(session)}
            onNewProject={(name) => void handleNewProject(name)}
            onNewSession={(projectId) => void handleNewSession(projectId)}
            onDeleteSession={(id) => void handleDeleteSession(id)}
          />

          <nav className="studio-sidebar__nav" aria-label="Studio">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="studio-nav-group">
                <span>{group.label}</span>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.route}
                    className={route === item.route ? "is-active" : ""}
                    aria-current={route === item.route ? "page" : undefined}
                    onClick={() => {
                      setRoute(item.route);
                      if (item.route === "plans") void refreshProductState();
                    }}
                  >
                    {route === item.route && (
                      <motion.span
                        className="studio-nav-active"
                        layoutId="nav-active"
                        aria-hidden="true"
                        transition={reduce ? { duration: 0 } : spring.soft}
                      />
                    )}
                    <small>{item.index}</small>
                    <strong>{item.label}</strong>
                    <i aria-hidden="true" />
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="studio-sidebar__account">
          <span className="studio-account-avatar">{account?.displayName.charAt(0) ?? "A"}</span>
          <span>
            <strong>{account?.displayName ?? "Local workspace"}</strong>
            <small>{account?.status === "signed-in" ? account.email : "Not signed in"}</small>
          </span>
          <button type="button" onClick={() => setRoute("settings")} aria-label="Account settings">···</button>
        </div>
      </aside>

      <main className="studio-main">
        <div className="studio-titlebar">
          <span>{NAV_GROUPS.flatMap((group) => group.items).find((item) => item.route === route)?.label}</span>
          <div className="studio-titlebar__right">
            <button
              type="button"
              className="studio-cmdk-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <span>Jump to…</span>
              <kbd>⌘K</kbd>
            </button>
            <span className="studio-titlebar__model">
              {settings ? `${MODELS.find((model) => model.id === settings.defaultModel)?.label} default` : "Loading workspace"}
            </span>
          </div>
        </div>
        <div className="studio-main__scroll scroll-thin">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              className="studio-view"
              variants={variants(viewTransition)}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {renderRoute()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commandItems} />
    </div>
  );
}
