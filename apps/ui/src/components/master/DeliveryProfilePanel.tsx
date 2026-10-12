import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { DeliveryProfile, DeliveryRule } from '../../types';
import { Disclosure } from '../primitives/Disclosure';
import { Panel } from '../primitives/Panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { describeCheck, profileCounts, requirementOwner } from './deliveryProfile';
import { LISTEN_ICON, Mark, ResultIcon, VerificationMark } from './RuleBadges';

const MUTED = { color: 'var(--text-muted)' };
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The requirement as recorded: in quotation marks only when it is the platform's own words. */
export function Requirement({ rule }: { rule: DeliveryRule }) {
  const text = rule.source.requirement;
  return <span className="italic">{rule.source.quoted ? `“${text}”` : text}</span>;
}

function CheckCell({ rule }: { rule: DeliveryRule }) {
  const text = describeCheck(rule);
  if (rule.checkedBy === 'listen' && !rule.off) {
    return (
      <span className="inline-flex items-start">
        <FontAwesomeIcon icon={LISTEN_ICON} aria-hidden="true" className="mt-0.5 mr-1.5 size-3.5 flex-none" style={{ color: 'var(--non-text)' }} />
        {text}
      </span>
    );
  }
  return (
    <span className="inline-flex items-start">
      <ResultIcon status={rule.off ? 'off' : rule.checkedBy === 'measured' ? 'met' : 'not_checked'} />
      <span>{text}</span>
    </span>
  );
}

/** Where the profile's rules come from, in one sentence. */
function sourceLine(profile: DeliveryProfile): string {
  const { title, url, readOn } = profile.source;
  const host = url ? ` (${new URL(url).host})` : '';
  if (profile.builtIn) {
    return `Every rule cites ${title}${host}, read ${readOn}. Each file is judged rule by rule; a rule the app cannot check is listed, never counted as met. This is a measurement, not ${profile.platform}'s approval.`;
  }
  return `Custom, revision ${profile.revision}${profile.note ? `. ${profile.note}` : ''}. Each file is judged rule by rule; a rule the app cannot check is listed, never counted as met.`;
}

/**
 * The rules behind the project's delivery profile, under Delivery's profile card (which names the profile and edits its limits;
 * the mock has nothing for the rest): how many rules the app checks, does not check and leaves to listening, and every rule with
 * what the platform requires, how the app checks it and how the requirement was verified.
 */
export function DeliveryProfilePanel({ profile }: { profile: DeliveryProfile }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel title="Profile rules">
      <ProfileBody profile={profile} open={open} onOpenChange={setOpen} />
    </Panel>
  );
}

function ProfileBody({ profile, open, onOpenChange }: { profile: DeliveryProfile; open: boolean; onOpenChange: (open: boolean) => void }) {
  const counts = profileCounts(profile);
  const owner = requirementOwner(profile);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm" style={MUTED}>
        {sourceLine(profile)}
      </p>
      <ul aria-label="Rules at a glance" className="flex flex-wrap gap-2">
        <li>
          <Mark tone="ok">{`${counts.checked} checked by the app`}</Mark>
        </li>
        <li>
          <Mark tone="info">{`${counts.notChecked} not checked by the app`}</Mark>
        </li>
        <li>
          <Mark tone="muted" icon={LISTEN_ICON}>{`${counts.listen} listen`}</Mark>
        </li>
        {counts.off > 0 && (
          <li>
            <Mark tone="muted">{`${counts.off} off`}</Mark>
          </li>
        )}
        {counts.toVerify + counts.conflicting > 0 && (
          <li>
            <Mark tone="warn">{`${counts.toVerify + counts.conflicting} to verify`}</Mark>
          </li>
        )}
      </ul>
      <Disclosure title="Rules and their sources" summary={plural(profile.rules.length, 'rule')} open={open} onOpenChange={onOpenChange}>
        {/* tabIndex: the table scrolls sideways in a narrow window, and a scrolling region must be reachable by keyboard. */}
        <div
          tabIndex={0}
          className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-inset"
        >
          <Table label="Rules and their sources" className="mt-2">
            <TableHead>
              <TableRow>
                <TableHeader>Rule</TableHeader>
                <TableHeader>{owner}</TableHeader>
                <TableHeader>How the app checks it</TableHeader>
                <TableHeader>Source</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {profile.rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="min-w-[9rem]">
                    <span className="block font-medium">{rule.label}</span>
                    <span className={`${MONO} block text-[0.72rem]`} style={MUTED}>
                      {rule.id} · {rule.scope === 'file' ? 'each file' : 'book'}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[12rem]">
                    <Requirement rule={rule} />
                  </TableCell>
                  <TableCell className="min-w-[12rem]">
                    <CheckCell rule={rule} />
                  </TableCell>
                  <TableCell className="min-w-[10rem]">
                    <VerificationMark verification={rule.verification} />
                    {rule.verificationNote && (
                      <span className="mt-1 block text-[0.75rem]" style={MUTED}>
                        {rule.verificationNote}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs" style={MUTED}>
          {profile.source.title ? `Source: ${profile.source.title}, read ${profile.source.readOn}. ` : ''}
          Loudness (LUFS) and true peak are shown in each file&apos;s detail for information
          {profile.builtIn ? `: ${profile.platform}'s page, as recorded, sets no LUFS rule.` : '.'}
        </p>
      </Disclosure>
    </div>
  );
}
