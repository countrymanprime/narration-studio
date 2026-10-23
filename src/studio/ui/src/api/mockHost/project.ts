// The mock host (mockApi.ts): projects and the DAW link.
import type { DawCatalogEntry, NarrationApi, ProjectAttachState, RecentProject } from '../../types';
import { wireClone } from '../mockFixtures';
import type { MockApiSeed } from './state';
import { brand } from '../../brand.gen';

/** The host's words for a project handed over while this app is busy (src/studio/desktop/app.go's attachBusyReason). */
const ATTACH_BUSY_REASON = 'The app is busy, so the current project was left unchanged.';
const DEFAULT_PROJECT_FOLDER = 'C:/Projects/Alice-in-Wonderland';
const DEFAULT_PROJECT_NAME = 'Alice’s Adventures in Wonderland';
// Mirrors the Go host's default (`~/<default projects folder>`, project.DefaultDirName): what an empty parent
// resolves to in ProjectCreateIn.
const DEFAULT_PROJECTS_DIRECTORY = `C:/Users/Mock/${brand.identity.defaultProjectsFolder}`;

/** Mirrors the Go backend's `filepath.Base(path)` default-naming rule for a folder chosen with no explicit name. */
function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** The project bindings: the open project, the recent list, the linked DAW project file and the DAW catalog. */
export function createProjectMock(
  initial: MockApiSeed,
  daws: { launch: () => Promise<'started' | 'busy'>; linked?: boolean; relinked?: () => void } = { launch: async () => 'started' },
) {
  let projectFolder = initial.projectFolder ?? DEFAULT_PROJECT_FOLDER;
  let projectName = initial.projectFolder === undefined ? DEFAULT_PROJECT_NAME : basename(projectFolder);
  let daw = 'REAPER';
  // Whether the mock project has a linked DAW project file, independent of `daw`: real Bootstrap
  // computes this from the manifest, not the label. Defaults to true so the existing default-linked mock scenarios
  // (App.test.tsx clicking into Proofing) keep working; attaching a different project resets it, like a fresh
  // project would have no link yet.
  let dawFileLinked = initial.dawFileLinked ?? daws.linked ?? true;
  let dawRppPath = `${projectFolder}/${basename(projectFolder)}.rpp`;
  // Independent of dawFileLinked/dawReachable: a detection fact about the machine, not about this
  // project's link (docs/architecture/daw-integration.md). Defaults to true so the default capture shows
  // REAPER detected; ?mockDawNotDetected=1 flips it for the not-detected + "Get REAPER" state.
  const dawCatalogInstalled = initial.dawCatalogInstalled ?? true;
  const DAW_CATALOG: DawCatalogEntry[] = [
    {
      id: 'reaper',
      name: 'REAPER',
      publisher: 'Cockos Incorporated',
      licenseNote: "A fully-functional evaluation license from the publisher's own site; see their page for terms.",
      installed: dawCatalogInstalled,
      ...(dawCatalogInstalled ? { path: 'C:/Program Files/REAPER (x64)/reaper.exe', source: 'uninstall_registry' } : {}),
    },
  ];
  let recentProjects: RecentProject[] = [
    { path: 'C:\\Projects\\Alice-in-Wonderland', name: 'Alice’s Adventures in Wonderland', lastOpened: '2026-09-15T09:00:00Z', pinned: false },
    { path: 'C:\\Projects\\Voltage-and-the-Undercroft', name: 'Voltage and the Undercroft', lastOpened: '2026-09-10T18:30:00Z', pinned: false },
  ];
  const projectAttachSubscribers = new Set<(state: ProjectAttachState) => void>();
  const attachProject = (path: string, name?: string) => {
    projectFolder = path;
    projectName = name || basename(path);
    daw = 'Standalone';
    // A newly attached project has no stored DAW link yet, matching the real host: dawFileLinked is computed from
    // the new project's own manifest, not carried over from whatever was open before.
    dawFileLinked = false;
    dawRppPath = `${projectFolder}/${projectName}.rpp`;
    projectAttachSubscribers.forEach((fn) => fn({ attached: true }));
    return { switched: true };
  };
  const bindings = {
    subscribeProjectAttach: (onUpdate) => {
      projectAttachSubscribers.add(onUpdate);
      return () => projectAttachSubscribers.delete(onUpdate);
    },
    projectRecents: async () => wireClone(recentProjects),
    selectProjectFolder: async () => ({ selected: true, path: 'C:/Projects/Mock-Project' }),
    switchProject: async (path, name) => attachProject(path, name),
    createProject: async (parent, name) => attachProject(`${parent || DEFAULT_PROJECTS_DIRECTORY}/${name}`, name),
    projectDefaultLocation: async () => ({ path: DEFAULT_PROJECTS_DIRECTORY }),
    removeRecentProject: async (path) => {
      recentProjects = recentProjects.filter((entry) => entry.path.toLowerCase() !== path.toLowerCase());
      return wireClone(recentProjects);
    },
    setProjectPinned: async (path, pinned) => {
      recentProjects = recentProjects.map((entry) => (entry.path.toLowerCase() === path.toLowerCase() ? { ...entry, pinned } : entry));
      return wireClone(recentProjects);
    },
    projectRunningDaw: async () => {
      const running = initial.dawRunningProject ? recentProjects[1] : undefined;
      return running ? { linked: true, path: running.path, name: running.name } : { linked: false, path: '', name: '' };
    },
    linkDawFile: async () => {
      dawFileLinked = true;
      // The picker offers the project the DAW has open (the Booth's "Link the open project"): that file is the linked one now.
      daws.relinked?.();
      if (initial.dawLinkOutside) {
        return {
          selected: true,
          linked: true,
          path: 'D:/Audio/Elsewhere/Elsewhere.rpp',
          insideProject: false,
          note: `Elsewhere.rpp is in D:/Audio/Elsewhere; this project's folder is ${projectFolder}. The link keeps working while the REAPER file stays where it is.`,
        };
      }
      return { selected: true, linked: true, path: dawRppPath, insideProject: true };
    },
    // The launch hands over to the mock DAW (dawMock.ts), whose script decides whether and when a heartbeat follows (`?mockDaw=`).
    launchDaw: async () => {
      const outcome = await daws.launch();
      // The launch started REAPER, which handed its project to this app; a busy app turns it away, as the host's second-instance attach does.
      if (outcome === 'busy') {
        projectAttachSubscribers.forEach((fn) => fn({ attached: false, reason: ATTACH_BUSY_REASON }));
      }
      return { launched: true, path: 'C:/Program Files/REAPER (x64)/reaper.exe', source: 'uninstall_registry' };
    },
    dawCatalogList: async () => wireClone(DAW_CATALOG),
    dawCatalogOpenDownloadPage: async (id) => {
      if (!DAW_CATALOG.some((entry) => entry.id === id)) throw new Error(`Unknown DAW catalog entry "${id}"`);
      // The mock has no real browser to open; it only proves the call reached a known id (Vitest's "no navigation
      // without a click" success metric is exercised at the component level, not here).
    },
  } satisfies Partial<NarrationApi>;
  return {
    bindings,
    projectFolder: () => projectFolder,
    projectName: () => projectName,
    daw: () => daw,
    dawFileLinked: () => dawFileLinked,
    setDawFileLinked: (linked: boolean) => {
      dawFileLinked = linked;
    },
  };
}

export type ProjectMock = ReturnType<typeof createProjectMock>;
