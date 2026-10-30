import { describe, expect, it } from 'vitest';
import { extractFile } from './extract';

const texts = (code: string) => extractFile('/x/src/components/Page.tsx', code).map((h) => ({ text: h.text, overlay: h.overlay }));
const LONG = 'Press the button to start the take, then wait until the meter settles.';

describe('prose extractor', () => {
  it('reads both branches of a ternary drawn as a child', () => {
    const found = texts(`export const A = ({ on }) => <p>{on ? '${LONG} One.' : '${LONG} Two.'}</p>;`);
    expect(found.map((f) => f.text)).toEqual([`${LONG} One.`, `${LONG} Two.`]);
  });

  it('reads the right side of && and both sides of ?? and ||', () => {
    const found = texts(`export const A = ({ a, b }) => <div>{a && '${LONG} And.'}{b ?? '${LONG} Nullish.'}</div>;`);
    expect(found.map((f) => f.text)).toEqual([`${LONG} And.`, `${LONG} Nullish.`]);
  });

  it('reads a string a same-file constant or helper builds and the page draws', () => {
    const found = texts(`
      const NOTE = '${LONG} Constant.';
      const say = (name: string) => \`\${name} ${LONG} Helper.\`;
      function pick(on: boolean) { if (on) return '${LONG} Function.'; return 'Short.'; }
      export const A = () => <div><p>{NOTE}</p><p>{say('x')}</p><p>{pick(true)}</p></div>;`);
    expect(found.map((f) => f.text).sort()).toEqual([`${LONG} Constant.`, `${LONG} Function.`, `…  ${LONG} Helper.`.replace('…  ', '… '), 'Short.'].sort());
  });

  it('ignores a string no JSX child draws', () => {
    expect(texts(`const UNUSED = '${LONG} Never drawn.'; export const A = () => <p>Hi</p>;`).map((f) => f.text)).toEqual(['Hi']);
  });

  it('counts a HelpButton note as an overlay, not the page', () => {
    const found = texts(`export const A = () => <HelpButton label="About x">{'${LONG} Note.'}</HelpButton>;`);
    expect(found.every((f) => f.overlay)).toBe(true);
  });
});
