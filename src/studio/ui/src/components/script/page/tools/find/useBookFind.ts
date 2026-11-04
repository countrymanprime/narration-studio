// Find's matches on the Script page: the host's whole-book answer for the term showing (#2775), read through the page's cached search, so
// a search the jump menu chose reads the very answer its rows came from. Only the answer to the term still showing is used; a failure is
// said in a toast and Find shows no matches.

import { useEffect, useState } from 'react';
import type { ManuscriptSearchResult } from '../../../../../api/contracts/manuscript';
import { apiErrorMessage } from '../../../../../api/errorMessage';
import { overlay } from '../../../../../overlay/overlayService';
import { quoteTerm } from './findState';
import { bookMatches, type FindMatch } from './searchManuscript';

export type BookFind = {
  /** The matches the host sent, in book order: what Find marks and steps through. */
  matches: readonly FindMatch[];
  /** Every match in the book; more than `matches` holds when the host stopped at its cap. */
  total: number;
  /** `searching` until the answer to the term showing arrives; `failed` when the host refused or failed. */
  status: 'idle' | 'searching' | 'done' | 'failed';
};

type Answer = { term: string; search: unknown; matches: readonly FindMatch[]; total: number; failed: boolean };

const IDLE: BookFind = { matches: [], total: 0, status: 'idle' };

/** The matches for `term` while Find is `open`. `search` is the page's cached host search (`useManuscriptSearch`). */
export function useBookFind(open: boolean, term: string, search: (term: string) => Promise<ManuscriptSearchResult>): BookFind {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const asked = open && term.trim() !== '';
  useEffect(() => {
    if (!asked) return;
    let live = true;
    search(term).then(
      (result) => live && setAnswer({ term, search, matches: bookMatches(result), total: result.total, failed: false }),
      (error: unknown) => {
        if (!live) return;
        setAnswer({ term, search, matches: [], total: 0, failed: true });
        overlay.toast(`Couldn't find ${quoteTerm(term)} in the script: ${apiErrorMessage(error)}`, { tone: 'error', topic: 'script-find' });
      },
    );
    return () => {
      live = false;
    };
  }, [asked, term, search]);
  if (!asked) return IDLE;
  if (answer?.term !== term) return { matches: [], total: 0, status: 'searching' };
  // The same term after the manuscript was read again: the last answer stays marked until the new one arrives.
  if (answer.search !== search) return { matches: answer.matches, total: answer.total, status: 'searching' };
  return { matches: answer.matches, total: answer.total, status: answer.failed ? 'failed' : 'done' };
}
