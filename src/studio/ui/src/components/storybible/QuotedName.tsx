/** A name a narrator typed, quoted inside a sentence: one line at most, with the whole name as its tooltip, so a pasted run of 10,000 characters never makes the sentence a screen (#3382 g). The quotes and the name are one unit, so a narrow line never leaves an opening quote or the sentence's full stop alone: pass the punctuation that follows as `after`. */
export function QuotedName({ name, after = '' }: { name: string; after?: string }) {
  return (
    <span className="inline-flex max-w-[12rem] align-bottom whitespace-nowrap" data-quoted-name>
      <span aria-hidden="true">“</span>
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      <span className="flex-none">”{after}</span>
    </span>
  );
}
