import { Immer } from 'immer'
import { ingestRaw } from '@/state/extractionCore'
import { RULES_FINDINGS } from './extraction'
import { BookData, type Chapter, type ProofNote, type DeliveryProfile, type Limits } from '@/domain/schemas'
import type { HeadingStyle } from '@/format/headings'
import { phrasesOf } from '@/selectors/phrases'
import { textKey } from '@/selectors/checks'
import { evidenceKey } from '@/selectors/proof'
import { SAMPLE_PROFILE } from './platforms'
import { CONTRACT, SAMPLE_CHECKS } from './schedule'
import { STAGE_DECISIONS, STAGE_SUGGESTIONS } from './readiness'
import { keyOfValues } from '@/selectors/readinessKey'
import {
  BIBLE, CHAPTERS, DEFAULT_BIBLE_TYPES, DEFAULT_MARKS, DICTIONARY, MASTER_ROWS, MILESTONES, PARAGRAPHS, PENDING_MANUSCRIPT,
  DETECTIONS, FX_PRESETS, FX_REGIONS, PASSAGES, PICKUPS, PRONUNCIATIONS, PROJECTS, PROOF_NOTES, RELATIONSHIPS, seedAnnotations,
} from './alice'

/** The ACX limits. Built in; a custom profile starts as a copy and can be edited. */
export const ACX_LIMITS: Limits = {
  rms: { l: 'RMS loudness', u: 'dB', lo: -23, hi: -18 },
  peak: { l: 'Peak level', u: 'dB', hi: -3 },
  nf: { l: 'Noise floor', u: 'dB', hi: -60 },
  head: { l: 'Room tone at the start', u: 's', lo: 0.5, hi: 1.0 },
  tail: { l: 'Room tone at the end', u: 's', lo: 1.0, hi: 5.0 },
}
const ACX_FORMAT = {
  format: 'MP3', rate: '44.1 kHz', bitrate: '192 kbps CBR', channels: 'Mono', max: '120', sample: '1 to 5 min', files: 'One file per chapter',
}
/** A note's evidence key names what it was found on, and a note decided in the sample starts with that decision in its history. */
function withEvidence(n: ProofNote): ProofNote {
  const evidence = evidenceKey(n)
  return { ...n, evidence, history: n.res ? [{ res: n.res, at: '2026-09-24', note: '', evidence, heard: n.heard }] : [] }
}
/** Not frozen: the sample book is a plain object (tests and mock states edit it directly). */
const plain = new Immer({ autoFreeze: false })
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export const PROFILES: DeliveryProfile[] = [
  { key: 'acx', name: 'ACX', builtin: true, limits: clone(ACX_LIMITS), format: { ...ACX_FORMAT } },
  { key: 'custom', name: 'Custom', builtin: false, limits: clone(ACX_LIMITS), format: { ...ACX_FORMAT } },
]

export interface BookOptions {
  /** 12 = as imported; 40 adds sample chapters so long-book layouts can be checked. */
  chapters?: 12 | 40
  headingStyle?: HeadingStyle
}

export function extraChapters(upTo: number): Chapter[] {
  const out: Chapter[] = []
  for (let i = 13; i <= upTo; i++) {
    out.push({ id: 'x' + i, n: i, title: 'Sample chapter ' + i, kind: 'chapter', words: 2000, prep: 'none', rec: 0, edit: 0, proof: 0 })
  }
  return out
}

/** Chapters for a book of this length: the 12 imported ones, any sample chapters, then the closing credits. */
export function chaptersFor(n: 12 | 40): Chapter[] {
  const base = CHAPTERS.map((c) => ({ ...c }))
  const close = base.findIndex((c) => c.id === 'close')
  return [...base.slice(0, close), ...extraChapters(n), ...base.slice(close)]
}

/** A few phrases start confirmed so both the confirmed and the suggested state show. */
const CONFIRMED_PARAS = ['8-2', '8-4', '8-6']

export function makeBook(opts: BookOptions = {}): BookData {
  const book: BookData = BookData.parse({
    projectName: 'Alice’s Adventures in Wonderland',
    deliveryProfile: SAMPLE_PROFILE,
    today: '2026-09-26',
    due: '2026-10-14',
    manuscript: {
      name: 'alice-in-wonderland.docx',
      path: 'C:\\Audiobooks\\Alice\\manuscript\\alice-in-wonderland.docx',
      imported: 'Sep 12',
      headingStyle: opts.headingStyle ?? 'gutenberg',
    },
    chapters: chaptersFor(opts.chapters ?? 12),
    paragraphs: PARAGRAPHS,
    confirmedSpeakers: {},
    annotations: seedAnnotations(),
    bookmarks: [],
    marks: DEFAULT_MARKS,
    bibleTypes: DEFAULT_BIBLE_TYPES,
    bible: BIBLE,
    relationships: RELATIONSHIPS,
    pronunciations: PRONUNCIATIONS,
    dictionary: DICTIONARY,
    proofNotes: PROOF_NOTES.map(withEvidence),
    passages: PASSAGES,
    detections: DETECTIONS,
    fxPresets: FX_PRESETS,
    fxRegions: FX_REGIONS,
    cuts: [],
    wordFx: [],
    accepted: [],
    editor: { fxCapPct: 10, backups: false, backupWindow: 90, backupKeepDays: 14, retryMode: 'leave', retryChapters: {} },
    passageMap: [],
    backups: [],
    pickups: PICKUPS,
    pickDone: [],
    pickOut: [],
    pickGone: [],
    pickSync: [],
    resume: {},
    checks: [],
    findingReviews: [],
    stageDecisions: STAGE_DECISIONS.map((d) => ({ ...d, evidence: 'sample' })),
    stageSuggestions: STAGE_SUGGESTIONS.map((x) => ({ ...x, key: keyOfValues(x.stage, x.values) })),
    rateBasis: 'standard',
    reports: [],
    reportDir: 'C:\\Audiobooks\\Alice\\reports',
    masterRows: MASTER_ROWS,
    profiles: PROFILES,
    milestones: MILESTONES,
    contract: CONTRACT,
    projects: PROJECTS,
    pendingManuscript: PENDING_MANUSCRIPT,
  })
  // First mention of each Story Bible entry that has none yet, found in the text.
  const withFirst = book.bible.map((b) => {
    if (b.first) return b
    const re = new RegExp('\\b(?:' + b.aka.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b')
    const c = book.chapters.find((c) => book.paragraphs.filter((p) => p.chapterId === c.id).some((p) => re.test(p.text)))
    return c ? { ...b, first: c.id } : b
  })
  const checks = SAMPLE_CHECKS.map((k) => ({ ...k, textKey: textKey(book, k.chapterId) }))
  const seeded = { ...book, bible: withFirst, checks }
  const confirmed: Record<string, string> = {}
  for (const id of CONFIRMED_PARAS) {
    const p = seeded.paragraphs.find((x) => x.id === id)
    if (!p) continue
    phrasesOf(p, seeded).forEach((ph) => {
      if (ph.q && ph.spk !== '?') confirmed[ph.key] = ph.spk
    })
  }
  /* The rules provider has already looked at the sample manuscript: its findings are the review queue the Story Bible opens with. */
  return plain.produce({ ...seeded, confirmedSpeakers: confirmed }, (d) => { ingestRaw(d, RULES_FINDINGS, 'rules', d.today) })
}
