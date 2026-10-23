import { Fragment, memo, type MouseEvent, type ReactNode } from 'react';
import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import { kindChipColors, kindDef, type KindId } from '../../../../kinds/kindMap';
import { kindMarkStyle } from '../../../../kinds/markStyle';
import { composeLayers, type Layer, type PhraseLayer } from './layers';
import { markStyle } from './markStyles';
import { CHANGE_HIGHLIGHT_CLASSES } from '../../../primitives/changeHighlight';

export type FindRange = { start: number; end: number };

export type ParaProps = {
  paragraph: ManuscriptParagraph;
  /** Marks, flagged words, name mentions and speaker phrases of this paragraph; keep it the same array until one changes. */
  layers: readonly Layer[];
  /** The Find matches in this paragraph, and which of them is the current one (-1 for none). */
  find?: readonly FindRange[];
  findCurrent?: number;
  /** The selected mark, when it is in this paragraph. */
  activeMarkId?: string | null;
  /** Pulses the gutter: the bookmark just gone to is in this paragraph. */
  flash?: boolean;
  /** The bookmark ribbons, drawn in the left gutter. With no slot the gutter is empty. */
  renderGutter?: (paragraph: ManuscriptParagraph) => ReactNode;
  /** A click on a speaker chip, with the chip's rectangle for the picker to anchor to. */
  onPickSpeaker?: (cueId: string, anchor: DOMRect) => void;
};

const NO_FIND: readonly FindRange[] = [];

/** The registry kind a speaker chip is drawn as (D6): a confirmed speaker in its entry's colour, a suggested one dashed, an unknown one neutral and dashed. */
const CHIP_KIND: Record<PhraseLayer['state'], KindId> = { confirmed: 'speaker', suggested: 'speaker-suggested', unknown: 'speaker-unknown' };

const STATE_WORDS: Record<PhraseLayer['state'], string> = { confirmed: 'confirmed', suggested: 'suggested', unknown: 'unknown' };

/** The speaker chip at the start of a quoted phrase. It draws its label from an attribute, so the paragraph's text is unchanged. */
function Chip({ phrase, onPick }: { phrase: PhraseLayer; onPick?: ParaProps['onPickSpeaker'] }) {
  const click = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onPick?.(phrase.cueId, event.currentTarget.getBoundingClientRect());
  };
  const kind = CHIP_KIND[phrase.state];
  const colours = kindChipColors(kind, phrase.colour ?? undefined);
  const name = phrase.state === 'unknown' ? 'speaker unknown' : `${phrase.label}, ${STATE_WORDS[phrase.state]}`;
  return (
    // native-control-ok: the chip is an inline label in running text, with no box of its own; Button and IconButton draw a bordered control
    <button
      type="button"
      data-chip={phrase.cueId}
      data-state={phrase.state}
      data-label={phrase.label}
      aria-label={`Speaker: ${name}. Change speaker`}
      onClick={click}
      className="mr-1 inline-block cursor-pointer rounded-sm border px-1 align-baseline text-[0.7em] leading-[1.5] font-semibold select-none before:content-[attr(data-label)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      style={{
        background: colours.fill,
        color: colours.text,
        borderStyle: kindDef(kind).dashed ? 'dashed' : 'solid',
        borderColor: kindDef(kind).dashed ? colours.line : 'transparent',
      }}
    />
  );
}

function wrap(layer: Layer, node: ReactNode, activeMarkId: string | null | undefined): ReactNode {
  switch (layer.kind) {
    case 'phrase':
      return (
        <span data-ph={layer.cueId} data-spk={layer.speakerId ?? ''} data-state={layer.state}>
          {node}
        </span>
      );
    case 'name':
      return (
        <span data-ent={layer.entryId} data-k={layer.entryKind} className="rounded-sm" style={kindMarkStyle('entity', layer.colour)}>
          {node}
        </span>
      );
    case 'word':
      return (
        <span data-w={layer.key} data-a={layer.flagId} data-status={layer.status} className="rounded-sm" style={kindMarkStyle('pron')}>
          {node}
        </span>
      );
    case 'mark':
      return (
        <span
          data-a={layer.id}
          data-st={layer.style}
          title={layer.name}
          className={activeMarkId === layer.id ? 'rounded-sm ring-2 ring-[var(--focus)]' : undefined}
          style={markStyle(layer.colour, layer.style)}
        >
          {node}
        </span>
      );
    case 'find':
      return (
        <mark className={`rounded-sm ${layer.current ? 'a-find-cur ring-2 ring-[var(--search)]' : ''}`} style={kindMarkStyle('search')} data-kind="search">
          {node}
        </mark>
      );
  }
}

/**
 * One paragraph: its own text, split at every layer boundary, with the layers wrapped around the pieces (outermost first), a
 * speaker chip at the start of each quoted phrase and the bookmark gutter at its left. Memoised on its props, so scrolling
 * (which changes none of them) draws no paragraph again.
 */
export const Para = memo(function Para({
  paragraph,
  layers,
  find = NO_FIND,
  findCurrent = -1,
  activeMarkId,
  flash = false,
  renderGutter,
  onPickSpeaker,
}: ParaProps) {
  const found: Layer[] = find.map((range, i) => ({ kind: 'find', start: range.start, end: range.end, current: i === findCurrent }));
  const pieces = composeLayers(paragraph.text, found.length ? [...layers, ...found] : layers);
  return (
    <div
      data-para={paragraph.id}
      data-ch={paragraph.chapterId}
      data-just-changed={flash ? '' : undefined}
      className={`relative py-1.5 ${flash ? `flash ${CHANGE_HIGHLIGHT_CLASSES}` : ''}`}
    >
      <div data-gutter="" className="absolute inset-y-0 left-[-19px] w-4">
        {renderGutter?.(paragraph)}
      </div>
      <p data-pid={paragraph.id} className="m-0 whitespace-pre-wrap">
        {pieces.map((piece) => {
          let node: ReactNode = piece.text;
          for (let i = piece.layers.length - 1; i >= 0; i--) node = wrap(piece.layers[i], node, activeMarkId);
          return (
            <Fragment key={piece.start}>
              {piece.chipFor ? <Chip phrase={piece.chipFor} onPick={onPickSpeaker} /> : null}
              {node}
            </Fragment>
          );
        })}
      </p>
    </div>
  );
});
