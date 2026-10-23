// The status, decision, verdict and take-state tones (docs/research/finding-colours-and-chips.md section 4.4, the owner's
// answers D7, D10 and D11). One meaning, one tone; the label and the icon carry the difference between meanings that share a tone.
// Status maps elsewhere in the app retire into this one a page group at a time (kindMap.test.ts lists them).
import type { StatusTone } from '../components/primitives/StatusBadge';

const STATUS = {
  // Decisions on a finding
  pickup: { label: 'Needs pickup', tone: 'accent' },
  edit: { label: 'Fix in edit', tone: 'info' },
  waive: { label: 'Waived', tone: 'success' },
  keep: { label: 'Kept', tone: 'success' },
  fixed: { label: 'Fixed', tone: 'success' },
  defer: { label: 'Deferred', tone: 'neutral' },
  unreviewed: { label: 'Unreviewed', tone: 'neutral' },
  // Done and good
  accepted: { label: 'Accepted', tone: 'success' },
  recorded: { label: 'Recorded', tone: 'success' },
  pass: { label: 'Pass', tone: 'success' },
  ready: { label: 'Ready', tone: 'success' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  done: { label: 'Done', tone: 'success' },
  on_track: { label: 'On track', tone: 'success' },
  installed: { label: 'Installed', tone: 'success' },
  // Nothing to say yet
  not_started: { label: 'Not started', tone: 'neutral' },
  not_checked: { label: 'Not checked', tone: 'neutral' },
  waiting: { label: 'Waiting', tone: 'neutral' },
  muted: { label: 'Muted', tone: 'neutral' },
  // Under way
  in_progress: { label: 'In progress', tone: 'info' },
  downloading: { label: 'Downloading', tone: 'info' },
  verifying: { label: 'Verifying', tone: 'info' },
  checking: { label: 'Checking', tone: 'info' },
  // Look again
  changed: { label: 'Changed', tone: 'warning' },
  to_verify: { label: 'To verify', tone: 'warning' },
  evidence_changed: { label: 'Evidence changed', tone: 'warning' },
  stale: { label: 'Stale', tone: 'warning' },
  at_risk: { label: 'At risk', tone: 'warning' },
  tight: { label: 'Tight', tone: 'warning' },
  needs_review: { label: 'Needs review', tone: 'warning' },
  draft: { label: 'Draft', tone: 'warning' },
  repair: { label: 'Repair', tone: 'warning' },
  // D10: a pickup still to record is a thing still to do
  open_pickup: { label: 'Open', tone: 'warning' },
  // Wrong
  failed: { label: 'Failed', tone: 'danger' },
  fail: { label: 'Fail', tone: 'danger' },
  not_ready: { label: 'Not ready', tone: 'danger' },
  behind: { label: 'Behind', tone: 'danger' },
  late: { label: 'Late', tone: 'danger' },
  // Install, service, DAW capability and engine link states (note 5.3, PR 7)
  not_installed: { label: 'Not installed', tone: 'neutral' },
  unavailable: { label: 'Not available yet', tone: 'neutral' },
  online: { label: 'Online', tone: 'success' },
  offline: { label: 'Offline', tone: 'warning' },
  no_key: { label: 'No key saved', tone: 'warning' },
  supported: { label: 'Supported', tone: 'success' },
  experimental: { label: 'Experimental', tone: 'experimental' },
  not_yet_available: { label: 'Not yet available', tone: 'neutral' },
  unsupported: { label: 'Unsupported', tone: 'neutral' },
  linked: { label: 'Linked', tone: 'success' },
  not_linked: { label: 'Not linked', tone: 'neutral' },
  not_running: { label: 'Not running', tone: 'warning' },
  wrong_project: { label: 'Different project open', tone: 'warning' },
  // Delivery rules and package checks
  met: { label: 'Met', tone: 'success' },
  not_met: { label: 'Not met', tone: 'danger' },
  not_measurable: { label: 'Not measurable', tone: 'neutral' },
  off: { label: 'Off', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'neutral' },
  conflicting: { label: 'Conflicting sources', tone: 'warning' },
  no_estimate: { label: 'No estimate', tone: 'neutral' },
  // Takes (D11): identity has no hue, so a take is drawn by its state alone
  kept_take: { label: 'Kept', tone: 'success' },
  active_take: { label: 'Active', tone: 'info' },
  suggested_take: { label: 'Suggested', tone: 'accent' },
  // A line's later reads sit on the first read's spot (a stack), and the first read is the one they sit on; a hidden take is muted in the DAW.
  stacked_take: { label: 'Stacked', tone: 'info' },
  first_read: { label: 'First read', tone: 'neutral' },
  hidden_take: { label: 'Hidden', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export type StatusId = keyof typeof STATUS;

export const STATUS_IDS = Object.keys(STATUS) as StatusId[];

/** The tone a status is drawn in. */
export const statusTone = (id: StatusId): StatusTone => STATUS[id].tone;

/** The label a status is drawn with. */
export const statusLabel = (id: StatusId): string => STATUS[id].label;
