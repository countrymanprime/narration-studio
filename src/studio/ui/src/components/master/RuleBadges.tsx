import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCircleCheck, faCircleMinus, faCircleXmark, faEarListen, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import type { DeliveryRuleStatus, DeliveryVerification } from '../../types';
import { statusTone, type StatusId } from '../../kinds/statusTone';
import { StatusBadge, toneColors } from '../primitives/StatusBadge';

// The small status marks of Master & QC: a rule's result,
// how its requirement was verified, and the profile's counts. The words carry the meaning; the colour and icon repeat it.
// `Mark` draws through StatusBadge, the one badge primitive, in the registry's tone and the soft look every status pill has.

export function Mark({ status, icon, children }: { status: StatusId; icon?: IconDefinition; children: string }) {
  return <StatusBadge tone={statusTone(status)} shape="pill" label={children} icon={icon && <FontAwesomeIcon icon={icon} />} />;
}

// A rule's result: the registry status that sets the tone, the icon and the words (kinds/statusTone.ts). A rule the app does not check
// is "Not checked", neutral like everywhere else (it was info here alone).
const RESULT: Record<DeliveryRuleStatus, { status: StatusId; icon: IconDefinition; label: string }> = {
  met: { status: 'met', icon: faCircleCheck, label: 'Met' },
  not_met: { status: 'not_met', icon: faCircleXmark, label: 'Not met' },
  not_checked: { status: 'not_checked', icon: faCircleMinus, label: 'Not checked by the app' },
  not_measurable: { status: 'not_measurable', icon: faCircleMinus, label: 'Not measurable' },
  off: { status: 'off', icon: faCircleMinus, label: 'Off' },
};

export function ResultMark({ status }: { status: DeliveryRuleStatus }) {
  const { status: id, icon, label } = RESULT[status];
  return (
    <Mark status={id} icon={icon}>
      {label}
    </Mark>
  );
}

export function VerificationMark({ verification }: { verification: DeliveryVerification }) {
  if (verification === 'verified') return <Mark status="verified">Verified</Mark>;
  return (
    <Mark status={verification === 'conflicting' ? 'conflicting' : 'to_verify'} icon={faTriangleExclamation}>
      {verification === 'conflicting' ? 'Conflicting sources' : 'To verify'}
    </Mark>
  );
}

// 16 px, the mocks' round checklist icon (mock 05).
/** How a value stands in a table cell: an icon in the result's colour, beside the value in words. */
export function ResultIcon({ status }: { status: DeliveryRuleStatus }) {
  const { status: id, icon } = RESULT[status];
  return <FontAwesomeIcon icon={icon} aria-hidden="true" className="mr-1.5 size-4 flex-none" style={{ color: toneColors(statusTone(id)).text }} />;
}

export const LISTEN_ICON = faEarListen;
