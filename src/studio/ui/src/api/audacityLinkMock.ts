// The mock Audacity link: a stand-in for src/studio/desktop/bindings_audacity_link.go, so the Settings engine card, the engine panel and the
// header chip run their Audacity states with no host. Its payloads follow the host goldens (tests/fixtures/contracts/audacity-link-*.json;
// wireContracts.test.ts compares the sentences). It models the first-start procedure: the first start fails to load scripting, scripting is
// turned on while Audacity is closed, and the second start answers. The mock has no window to close, so "Check again" while Audacity is open
// and not answering counts as the narrator having closed it.
import type { AudacityLink, AudacityLinkApi, AudacityLinkState, AudacityLinkStep, AudacityOpenProject, DawCapabilities } from './contracts/daw';
import { wireClone } from './mockFixtures';

type Module = 'unknown' | 'on' | 'off';
type Pipe = 'absent' | 'silent' | 'no_project' | 'answering';

/** What is true of the narrator's computer, as `?mockAudacityLink=` names it. */
export type AudacityLinkMockSeed = {
  installed?: boolean;
  running?: boolean;
  module?: Module;
  pipe?: Pipe;
  /** The installed program looks like Audacity 4 (no scripting pipe). */
  looks4?: boolean;
  openProject?: AudacityOpenProject;
  /** The linked project file's name; null for none. */
  linkedFile?: string | null;
  /** Whether this project has an Audacity link recorded. Defaults to whether a file is linked. */
  linked?: boolean;
  /** Whether the computer can run Audacity's pipe at all (Windows). Defaults to true. */
  supported?: boolean;
};

export const AUDACITY_LINK_MOCK_SEEDS = {
  // A fresh computer: installed, never started.
  'first-start': { module: 'unknown' },
  // The first start failed to load scripting and Audacity is closed: turn it on.
  'module-off': { module: 'off' },
  // Scripting on, Audacity closed.
  'not-running': { module: 'on', linkedFile: 'Book One.aup3' },
  // Open before scripting was read.
  'needs-restart': { module: 'on', running: true },
  // Answering with a project that has no link label yet.
  answering: { module: 'on', running: true, pipe: 'answering', openProject: 'unlabelled' },
  // Answering with this project's Audacity project.
  linked: { module: 'on', running: true, pipe: 'answering', openProject: 'linked', linkedFile: 'Book One.aup3' },
  // Waiting on a dialog.
  dialog: { module: 'on', running: true, pipe: 'silent', linkedFile: 'Book One.aup3' },
  // Open with no project.
  'no-project': { module: 'on', running: true, pipe: 'no_project' },
  // Audacity 4 is what is installed.
  audacity4: { module: 'on', looks4: true },
  'not-installed': { installed: false, module: 'unknown' },
} satisfies Record<string, AudacityLinkMockSeed>;

export type AudacityLinkMockName = keyof typeof AUDACITY_LINK_MOCK_SEEDS;

const STATE_MESSAGES: Record<AudacityLinkState, string> = {
  unsupported: 'Linking Audacity works on Windows only, so the app cannot connect to Audacity on this computer.',
  not_installed: 'Audacity was not found on this computer. Install Audacity 3 (Audacity 4 has no scripting and cannot be linked), and the app connects to it.',
  not_running: 'Audacity is not running. Start it here and the app connects.',
  module_off: '',
  needs_restart: 'Audacity is open but the app cannot reach it. Audacity reads its scripting setting when it starts: close Audacity, then start it from here.',
  audacity4:
    'The Audacity on this computer looks like Audacity 4, which has no scripting pipe, so the app cannot connect to it. Install Audacity 3.7 to use Audacity with the app.',
  dialog:
    'Audacity is open but did not answer. It may be waiting on a dialog: look for a message box in Audacity, close it, and the app reconnects by itself. Nothing is sent to Audacity meanwhile.',
  no_project:
    'Audacity is open but has no project. Open the project in Audacity (File > Open), or start it from here with the linked project. The app connects by itself once a project is open.',
  answering: '',
};

type Facts = Required<Pick<AudacityLinkMockSeed, 'installed' | 'running' | 'module' | 'pipe' | 'looks4' | 'openProject' | 'supported'>> & {
  linkedFile: string | null;
  linked: boolean;
};

function answeringMessage(project: AudacityOpenProject): string {
  switch (project) {
    case 'linked':
      return "Audacity is open and answering, with this project's Audacity project.";
    case 'other':
      return 'Audacity is open and answering, but its project is linked to a different project in this app. Open this project’s Audacity project, or link the open one.';
    case 'unlabelled':
      return 'Audacity is open and answering. Its project is not linked to this one yet: link it to let the app mark lines in it.';
    default:
      return 'Audacity is open and answering.';
  }
}

function stepsOf(f: Facts): AudacityLinkStep[] {
  const answering = f.pipe === 'answering' || f.pipe === 'no_project';
  return [
    { id: 'installed', label: 'Audacity 3 is installed', done: (f.installed || f.running) && !f.looks4 },
    { id: 'started_once', label: 'Audacity has started once, so it has made its settings', done: f.module !== 'unknown' || answering },
    { id: 'scripting_on', label: 'Scripting is turned on in Audacity', done: f.module === 'on' || answering },
    { id: 'answering', label: 'Audacity answers the app', done: answering },
  ];
}

/** The verdict for the facts: a TypeScript twin of audacitylink.Classify in Go, for the mock only (the goldens pin the sentences). */
function classify(f: Facts): Pick<AudacityLink, 'state' | 'message' | 'action' | 'openProject'> {
  const v = (state: AudacityLinkState, message: string, action: AudacityLink['action'] = 'none', openProject: AudacityOpenProject = 'unknown') => ({
    state,
    message,
    action,
    openProject,
  });
  if (!f.supported) return v('unsupported', STATE_MESSAGES.unsupported);
  if (f.pipe === 'answering') return v('answering', answeringMessage(f.openProject), 'none', f.openProject);
  if (f.pipe === 'no_project') return v('no_project', STATE_MESSAGES.no_project);
  if (f.pipe === 'silent') return v('dialog', STATE_MESSAGES.dialog);
  if (!f.installed && !f.running) return v('not_installed', STATE_MESSAGES.not_installed);
  if (f.running && f.module === 'on') return v(f.looks4 ? 'audacity4' : 'needs_restart', f.looks4 ? STATE_MESSAGES.audacity4 : STATE_MESSAGES.needs_restart);
  if (f.running)
    return v(
      'module_off',
      "Audacity's scripting is not turned on, and Audacity is open. Close Audacity: it saves its settings when it closes, so the app can turn scripting on only then. The app turns it on as soon as Audacity is closed and starts it again.",
    );
  if (f.module === 'on') return f.looks4 ? v('audacity4', STATE_MESSAGES.audacity4) : v('not_running', STATE_MESSAGES.not_running, 'launch');
  if (f.module === 'off')
    return v(
      'module_off',
      "Audacity's scripting is not turned on. The app turns it on by itself while Audacity is closed, then starts Audacity. Audacity may need to start twice before the connection works: the first start can fail to load scripting.",
      'enable_module',
    );
  return v(
    'module_off',
    'Audacity has not set itself up yet: it makes its settings file the first time it starts, and that start cannot load scripting. Start it here, close it once it has opened, and the app turns scripting on and starts it again: two starts, the first time only.',
    'launch',
  );
}

export function createAudacityLinkMock(
  seed: AudacityLinkMockSeed,
  deps: { capabilities: () => Promise<DawCapabilities>; launched?: () => void },
): AudacityLinkApi & { launched(): void } {
  const facts: Facts = {
    installed: seed.installed ?? true,
    running: seed.running ?? false,
    module: seed.module ?? 'unknown',
    pipe: seed.pipe ?? 'absent',
    looks4: seed.looks4 ?? false,
    openProject: seed.openProject ?? 'unknown',
    supported: seed.supported ?? true,
    linkedFile: seed.linkedFile ?? null,
    linked: seed.linked ?? (seed.linkedFile ?? null) !== null,
  };
  let heardAt: number | null = facts.pipe === 'answering' ? Date.now() : null;
  const subs = new Set<(state: AudacityLink) => void>();

  const current = async (): Promise<AudacityLink> => {
    const chosen = (await deps.capabilities()).daw === 'Audacity';
    const verdict = classify(facts);
    return wireClone({
      hasProject: true,
      chosen,
      ...verdict,
      steps: stepsOf(facts),
      installed: facts.installed,
      running: facts.running,
      linked: facts.linked,
      linkedFile: facts.linkedFile,
      heardSecondsAgo: heardAt === null ? null : Math.max(0, Math.floor((Date.now() - heardAt) / 1000)),
    });
  };
  const push = async () => {
    const state = await current();
    subs.forEach((listener) => listener(wireClone(state)));
    return state;
  };

  return {
    audacityLink: current,
    audacityLinkCheck: async () => {
      // The mock has no window to close: an open Audacity that does not answer was closed by the narrator, as the first-start steps ask.
      if (facts.running && facts.pipe === 'absent' && facts.module !== 'on') facts.running = false;
      return push();
    },
    audacityEnableModule: async () => {
      if (facts.running) throw new Error('Audacity is open. Close it first, because it saves its settings when it closes; then turn scripting on.');
      if (facts.module === 'unknown') throw new Error('Audacity has not made its settings file yet: start Audacity once, close it, then turn scripting on');
      facts.module = 'on';
      return push();
    },
    audacityLinkFile: async () => {
      facts.linkedFile = 'Book One.aup3';
      facts.linked = true;
      return push();
    },
    audacityLinkOpenProject: async () => {
      if (facts.pipe !== 'answering') throw new Error('Audacity did not answer. Open the project in Audacity, then try again.');
      facts.linked = true;
      facts.openProject = 'linked';
      return push();
    },
    audacityUnlink: async () => {
      facts.linked = false;
      facts.linkedFile = null;
      if (facts.openProject === 'linked') facts.openProject = 'unlabelled';
      return push();
    },
    subscribeAudacityLink: (onUpdate) => {
      subs.add(onUpdate);
      return () => subs.delete(onUpdate);
    },
    launched: () => {
      // The first start cannot load scripting; later starts follow the settings. A start with scripting on answers a moment later.
      if (facts.running || !facts.installed || !facts.supported) return;
      facts.running = true;
      if (facts.module === 'unknown') facts.module = 'off';
      if (facts.module === 'on' && !facts.looks4) {
        facts.pipe = 'answering';
        facts.openProject = facts.linked ? 'linked' : 'unlabelled';
        heardAt = Date.now();
      }
      deps.launched?.();
      void push();
    },
  };
}
