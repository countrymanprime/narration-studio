/** A name a narrator typed, quoted inside a sentence: one line at most, with the whole name as its tooltip, so a pasted run of 10,000 characters never makes the sentence a screen (#3382 g). The quotes and the name are one unit, so a narrow line never leaves an opening quote alone. */
export function QuotedName({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-[12rem] align-bottom whitespace-nowrap" data-quoted-name>
      <span aria-hidden="true">“</span>
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      <span aria-hidden="true">”</span>
    </span>
  );
}
