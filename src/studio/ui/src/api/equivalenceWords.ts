/**
 * The host's rule for a pair of words TranscriptAddEquivalence can write (src/studio/desktop/internal/transcript/service.go `oneWord` and
 * `OneWordMisread`): each word is something with no Unicode space, control character or byte-order mark in it, neither holds a comma or #
 * (the file would split it or cut it as a comment), and the two are not the same word in another case (a group that changes nothing). Proof's
 * button and the mock host both ask this, so neither offers or accepts what the host refuses (qa B2 and B4 on #2807).
 */
export function equivalencePair(doc: string | undefined, audio: string | undefined): boolean {
  return oneWord(doc) && oneWord(audio) && doc!.toLowerCase() !== audio!.toLowerCase();
}

// `\s` is every Unicode space and the byte-order mark; `\p{Cc}` every control character (NUL, VT, FF, U+0085).
const NOT_IN_A_WORD = /[\s\p{Cc},#]/u;

const oneWord = (word: string | undefined): boolean => Boolean(word) && !NOT_IN_A_WORD.test(word!);
