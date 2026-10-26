import type { IconName } from '../../../icons.catalog';

/**
 * What the Settings page knows about a setting that the host does not tell it. The host's `fieldSchemas` give a row its kind, its choices and its
 * values; this registry gives it a home (category and section), a scope, who reads it, where else it can be changed, whether it is Advanced and
 * the words a narrator might search for. A new setting is one entry in `rows.ts`.
 */

/** A page that reads a setting, in the words of the navigation rail. */
export type UsedPage = 'production' | 'schedule' | 'script' | 'bible' | 'booth' | 'editing' | 'proof' | 'pickups' | 'master' | 'delivery';

export const PAGE_LABEL: Record<UsedPage, string> = {
  production: 'Production',
  schedule: 'Schedule',
  script: 'Script',
  bible: 'Story Bible',
  booth: 'Booth',
  editing: 'Editing',
  proof: 'Proof',
  pickups: 'Pickups',
  master: 'Master & QC',
  delivery: 'Delivery',
};

export const PAGE_PATH: Record<UsedPage, string> = {
  production: '/',
  schedule: '/schedule',
  script: '/script',
  bible: '/story-bible',
  booth: '/booth',
  editing: '/editing',
  proof: '/proof',
  pickups: '/pickups',
  master: '/master',
  delivery: '/delivery',
};

export type CategoryId = 'recording' | 'speech' | 'voice' | 'models' | 'delivery' | 'project' | 'appearance' | 'app' | 'pages';

export type Category = { id: CategoryId; label: string; group: CategoryGroup; icon: IconName; blurb: string };
export type CategoryGroup = 'Shared tools' | 'This project' | 'This computer';

/**
 * Whose a setting is. `computer` is one value for this computer; `project` belongs to the open project; `both` is a computer value a project may
 * override; `browser` is kept by this window, which a narrator sees as "this computer".
 */
export type Scope = 'computer' | 'project' | 'both' | 'browser';

/**
 * A named download a choice points at: the asset registry's kind and id. The kind may follow another row (the Booth's model is Whisper's or
 * Moonshine's, by the live engine chosen next to it).
 */
export type AssetRef = { kind: string | { followRow: string }; id: string };

export type OptionNote = { label?: string; asset?: AssetRef };

export type SettingMeta = {
  id: string;
  cat: Exclude<CategoryId, 'models' | 'pages'>;
  section: string;
  /** The label shown; the host's own label is the fallback. */
  label: string;
  desc: string;
  scope: Scope;
  /** The host field this row edits. A row without one draws its own control (`controls/`). */
  field?: { tool: string; key: string };
  /** The value when nothing is set. Checked against `config/defaults.json` by `rows.test.ts`. */
  def: string;
  /** Words and downloads for a host choice, by value; a value without an entry shows as the host sent it. */
  options?: Record<string, OptionNote>;
  unit?: string;
  used: readonly UsedPage[];
  /** Other places that write the same value, so a change made here is not a surprise there. */
  also?: string;
  advanced?: boolean;
  /** Words a narrator might type that the label does not contain. */
  syn?: string;
  /** A change that costs something asks first and says what happens. */
  costly?: { title: string; body: string; confirm: string };
  /** The row only applies to this recording tool and is hidden for another. */
  needs?: 'reaper';
  /** A note beside the control on when it takes effect. */
  effect?: string;
  /** A line under the control that the host works out for the value shown: `workerPlan` is how many transcriptions a recording check
   * would run at once on this computer and why (CoverageWorkerPlan). */
  live?: 'workerPlan';
  /** A warning for a value that costs this computer a lot (a large model, most of the processors), or `undefined`. Shown under the
   * control while that value is chosen; it does not stop the choice. */
  heavy?: (value: string) => string | undefined;
  /**
   * Looks at a value before it is saved: a sentence says why it is refused (the row shows it and keeps the old value), `undefined` lets it
   * through. For a rule the host does not enforce itself.
   */
  check?: (value: string) => string | undefined;
};
