/** A name a narrator typed, quoted inside a sentence: one line at most, with the whole name as its tooltip, so a pasted run of 10,000 characters never makes the sentence a screen (#3382 g). */
export function QuotedName({ name }: { name: string }) {
  return (
    <>
      “
      <span className="inline-block max-w-[16rem] truncate align-bottom" title={name}>
        {name}
      </span>
      ”
    </>
  );
}
