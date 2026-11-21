// The nightly slow-clock run (.github/workflows/slow-clock.yml) builds the mock app with UI_SLOW_CLOCK=0.7 so the whole page runs its `Date.now` at that
// fraction of real time, as if a spec's steps had gone faster than they do (#3931): a wait shorter than the Booth's 1 s start guard then fails here
// and not only on a quick CI runner. Mock builds only: a product build, or a rate outside (0, 1), adds nothing.

/** The script that slows `Date.now` to `factor` of real time, run first in <head>. */
export function slowClockScript(factor) {
  return `<script>(function(){var r=Date.now.bind(Date),o=r();Date.now=function(){return o+(r()-o)*${factor};};})();</script>`;
}

/** The Vite plugins for the mode and the UI_SLOW_CLOCK value: one that injects the script, or none. */
export function slowClock(mode, rate) {
  const factor = Number(rate);
  if (mode !== 'mock' || !rate || !(factor > 0 && factor < 1)) return [];
  return [{ name: 'slow-clock', transformIndexHtml: (html) => html.replace('<head>', `<head>${slowClockScript(factor)}`) }];
}
