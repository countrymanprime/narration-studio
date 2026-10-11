import type { Finding } from '../../../api/contracts/findings';
import { inspectorFinding } from '../inspector/testFinding';

/** A chapter's notes for the notes tests and stories: a spread of analyzers, confidences, severities and decisions. */
export function notesFixture(): Finding[] {
  const at = (start: number) => ({ start, end: start + 2 });
  const chapter = (id: string, title: string) => ({ chapter_id: id, chapter_title: title });
  return [
    inspectorFinding({
      id: 'a',
      time_range: at(12),
      confidence: 0.9,
      severity: 'warning',
      manuscript: { ...chapter('ch1', 'Chapter 1'), expected: 'I could not help it', recorded: 'I could not help myself' },
      evidence: { kind: 'MISREAD' },
    }),
    inspectorFinding({
      id: 'b',
      time_range: at(80),
      confidence: 0.4,
      severity: 'error',
      review: { status: 'accepted' },
      manuscript: { ...chapter('ch1', 'Chapter 1'), expected: 'the harbour wall', recorded: 'the harbor' },
      evidence: { kind: 'MISREAD' },
    }),
    inspectorFinding({
      id: 'c',
      time_range: at(130),
      confidence: null,
      confidence_reason: 'The pause was measured, not scored.',
      severity: 'info',
      category: 'pacing',
      analyzer: 'measure',
      review: { status: 'accepted' },
      manuscript: { ...chapter('ch1', 'Chapter 1'), expected: 'a long breath', recorded: '' },
    }),
    inspectorFinding({
      id: 'd',
      time_range: at(20),
      confidence: 0.7,
      severity: 'warning',
      review: { status: 'dismissed' },
      manuscript: { ...chapter('ch2', 'Chapter 2'), expected: 'Rowan', recorded: 'Rowen' },
      evidence: { kind: 'MISREAD' },
    }),
    inspectorFinding({
      id: 'e',
      time_range: at(300),
      confidence: 0.6,
      severity: 'warning',
      review: { status: 'deferred' },
      manuscript: { ...chapter('ch2', 'Chapter 2'), expected: 'across the square', recorded: 'across the square and back' },
      evidence: { kind: 'EXTRA' },
    }),
  ];
}
