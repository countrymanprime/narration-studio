export type RecentProject = { path: string; name: string; lastOpened: string };
export type ProjectFolderSelection = { selected: boolean; path?: string };
export type ProjectSwitchResult = { switched: boolean; reason?: string };
/**
 * ProjectLinkDawFile's result: `selected` is false only when the narrator cancelled the file dialog, in which case
 * nothing else is set. `linked` is false when the chosen file sits outside the project folder - `folderMismatch` and
 * `message` explain why (refuse rather than silently re-pointing the project, since that would orphan the imported
 * manuscript).
 */
export type DawLinkResult = { selected: boolean; linked: boolean; path?: string; folderMismatch?: boolean; message?: string };
/**
 * DawLaunch's result: `source` names where the executable
 * path came from (`settings_override`, `uninstall_registry` or `file_association`, apps/desktop/internal/daw),
 * so the narrator can be told when a Settings override was used.
 */
export type DawLaunchResult = { launched: boolean; path: string; source: string };

export interface ProjectApi {
  projectRecents(): Promise<RecentProject[]>;
  selectProjectFolder(): Promise<ProjectFolderSelection>;
  switchProject(path: string, name?: string): Promise<ProjectSwitchResult>;
  // parent is the folder the new project folder is created under; an empty string defaults to the
  // default projects directory. name is the project's own folder name, always required:
  // the New Project dialog collects it, replacing the old full-path createProject(path, name?).
  createProject(parent: string, name: string): Promise<ProjectSwitchResult>;
  removeRecentProject(path: string): Promise<RecentProject[]>;
  /**
   * Opens a native "*.rpp" file dialog and links the chosen file to the current project (one shared binding behind the audio engine panel
   * and Settings' DAW category).
   */
  linkDawFile(): Promise<DawLinkResult>;
  /** Starts REAPER on the current project's linked DAW file, a rejected promise on any refusal. */
  launchDaw(): Promise<DawLaunchResult>;
}
