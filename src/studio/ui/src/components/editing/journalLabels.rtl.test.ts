// Journal labels that carry a narrator's name (#4129 slice C): the label is BUILT isolated, so the "Undid <label>" toast, the "Undo '<label>' first"
// refusal, the History panel and the Jump menu all read it with the name held apart from the English round it. Each case builds the label with an
// RTL name and fails if the producer's isolatedIfRtl wrap is taken off.
import { describe, expect, it } from 'vitest';
import { recordedTakeCommand } from '../booth/record/takeCommand';
import { bypassCommand, compareCommand, setCommand } from './effects/EffectSettings';
import { addLabel, removeFxCommand } from './range/fx/fxCommand';
import { replaceLabel } from './range/replace/replaceCommand';
import { keepTakeCommand } from './takes/keepTake';
import { splitCommand } from './takes/split/splitCommand';

const FSI = '\u2068';
const PDI = '\u2069';
// An Arabic name; the escapes keep a literal RTL character out of the source.
const NAME = '\u0625\u0631\u064A\u0643';
const isolated = (name: string) => `${FSI}${name}${PDI}`;

describe('a journal label isolates the narrator name it carries', () => {
  it('Split <take> at the second read', () => {
    const command = splitCommand({} as never, { kind: 'recorder' } as never, { takeId: 't', chapterId: 'c', at: 1, label: NAME } as never);
    expect(command.label).toBe(`Split ${isolated(NAME)} at the second read`);
  });

  it('Kept <take>', () => {
    const command = keepTakeCommand({} as never, { id: 'p', takes: [] } as never, { label: NAME } as never);
    expect(command.label).toBe(`Kept ${isolated(NAME)}`);
  });

  it('Recorded a take of <title>', () => {
    const command = recordedTakeCommand({ daw: {} as never, result: { undoSteps: 1 } as never, title: NAME });
    expect(command.label).toBe(`Recorded a take of ${isolated(NAME)}`);
  });

  it('Replaced <n words> with <narrator>’s audio', () => {
    expect(replaceLabel(2, NAME, 3)).toBe(`Replaced 2 words with ${isolated(NAME)}'s audio at 00:00:03.000`);
  });

  it('Added <chain> to <n words>', () => {
    expect(addLabel(NAME, 3, 12)).toBe(`Added ${isolated(NAME)} to 3 words at 00:00:12.000`);
  });

  it('Took <chain> off <words>', () => {
    const fx = { chainName: NAME, text: NAME, keys: [] } as never;
    const command = removeFxCommand({} as never, { kind: 'recorder' } as never, { chapterId: 'c', fx, locator: {} as never });
    expect(command.label).toBe(`Took ${isolated(NAME)} off ${isolated(NAME)}`);
  });

  it('Set / Bypassed / Compared name the chain', () => {
    const fx = { chainName: NAME } as never;
    const target = { chapterId: 'c' } as never;
    expect(setCommand({} as never, target, fx, { name: 'Gain' } as never, 1, 0).label).toBe(`Set Gain of ${isolated(NAME)} to 1`);
    expect(bypassCommand({} as never, {} as never, (() => undefined) as never, target, fx, true).label).toBe(`Bypassed ${isolated(NAME)}`);
    expect(bypassCommand({} as never, {} as never, (() => undefined) as never, target, fx, false).label).toBe(`Turned on ${isolated(NAME)}`);
    expect(compareCommand({} as never, {} as never, (() => undefined) as never, target, fx, false).label).toBe(`Compared ${isolated(NAME)} with and without`);
  });

  it('leaves a Latin name bare', () => {
    expect(replaceLabel(1, 'Eric', 3)).toBe("Replaced 1 word with Eric's audio at 00:00:03.000");
  });
});
