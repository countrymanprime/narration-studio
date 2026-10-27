import { expect, test, type Page } from '@playwright/test';
import { scanLayout, type LayoutRule } from './lib/layoutScan';

// The alignment rules of lib/layoutScan.ts on pages built for them: each rule finds the defect it names and nothing on the same page
// laid out right. Runs in the real browser (layout is what is measured), on a blank page, not the app.

async function rulesOn(page: Page, body: string): Promise<LayoutRule[]> {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; font: 14px/20px sans-serif; }
    button { font: inherit; height: 32px; padding: 0 8px; border: 1px solid #888; background: #eee; }
    .card { border: 1px solid #888; background: #fff; padding: 16px; }
    .row { display: flex; gap: 8px; align-items: center; }
  </style></head><body><div id="root"><main>${body}</main></div></body></html>`);
  return (await page.evaluate(scanLayout)).map((hit) => hit.rule);
}

const cases: { rule: LayoutRule; bad: string; good: string }[] = [
  {
    rule: 'W1',
    bad: '<div style="width:90px"><button>Start the recording session</button></div>',
    good: '<div style="width:400px"><button>Start the recording session</button></div>',
  },
  {
    rule: 'W2',
    bad: '<div class="row" style="width:600px"><span style="width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long chapter name here</span><button>Go</button></div>',
    good: '<div class="row" style="width:600px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long chapter name here</span><button>Go</button></div>',
  },
  {
    rule: 'W3',
    bad: '<div style="width:120px;overflow:hidden;white-space:nowrap">A sentence that is cut at the edge</div>',
    good: '<div style="width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A sentence that is cut at the edge</div>',
  },
  {
    rule: 'W4',
    bad: '<div style="position:relative;height:40px"><span>First label</span><span style="position:relative;left:-40px">Second</span></div>',
    good: '<div style="position:relative;height:40px"><span>First label</span> <span>Second</span></div>',
  },
  {
    rule: 'H1',
    bad: '<div class="row" style="gap:2px"><button style="height:18px;width:18px;padding:0">x</button><button style="height:18px;width:18px;padding:0">y</button></div>',
    good: '<div class="row"><button>x</button><button>y</button><p>Read <a href="#a">the guide</a> first.</p></div>',
  },
  {
    rule: 'A1',
    bad: '<ul><li style="display:block">One</li><li style="display:block;margin-left:12px">Two</li></ul>',
    good: '<ul><li style="display:block">One</li><li style="display:block">Two</li></ul>',
  },
  {
    rule: 'A2',
    bad: '<div style="width:400px"><div style="display:block;border:1px solid">One</div><div style="display:block;border:1px solid;margin-right:12px">Two</div></div>',
    good: '<div style="width:400px"><div style="display:block;border:1px solid">One</div><div style="display:block;border:1px solid">Two</div></div>',
  },
  {
    rule: 'G3',
    bad: '<div role="toolbar" aria-label="2 selected" style="width:300px">Remove</div><table style="width:600px"><tr><td>a</td></tr></table>',
    good: '<div role="toolbar" aria-label="2 selected" style="width:600px">Remove</div><table style="width:600px"><tr><td>a</td></tr></table>',
  },
  {
    rule: 'A3',
    bad: '<div><div class="row"><span>a</span><span>b</span></div><div class="row"><span>aaaa</span><span>b</span></div></div>',
    good: '<div><div class="row" style="display:grid;grid-template-columns:100px 100px"><span>a</span><span>b</span></div><div class="row" style="display:grid;grid-template-columns:100px 100px"><span>aaaa</span><span>b</span></div></div>',
  },
  {
    rule: 'A4',
    bad: '<div style="width:500px"><div class="row"><span style="flex:1">One</span><button>Play</button><button>Remove</button></div><div class="row"><span style="flex:1">Two</span><button>Play</button><span style="width:36px"></span></div></div>',
    good: '<div style="width:500px"><div class="row"><span style="flex:1">One</span><button>Play</button></div><div class="row"><span style="flex:1">Two</span><button>Play</button></div></div>',
  },
  {
    rule: 'A5',
    bad: '<div><div class="row" style="padding:4px 0"><span>One</span></div><div class="row" style="padding:12px 0"><span>Two</span></div></div>',
    good: '<div><div class="row" style="padding:4px 0"><span>One</span></div><div class="row" style="padding:4px 0"><span>Two</span></div></div>',
  },
  {
    rule: 'A7',
    bad: '<div class="row" style="align-items:flex-start"><button style="height:36px">A</button><button style="height:28px">B</button></div>',
    good: '<div class="row"><button style="height:36px">A</button><button style="height:28px">B</button></div>',
  },
  {
    // The Editing page's paragraph time: 12 px beside 24 px text on a 36 px line, pushed down by padding in the text's em (#2094).
    rule: 'A8',
    bad: '<div style="display:grid;grid-template-columns:76px 600px;font-size:24px;line-height:1.5"><div style="padding-top:0.7em;text-align:right"><span style="font:12px/16px monospace">0:01</span></div><p style="margin:0">It was a bright cold day in April.</p></div>',
    good: '<div style="display:grid;grid-template-columns:76px 600px;font-size:24px;line-height:1.5"><div style="height:1lh;display:flex;align-items:center;justify-content:flex-end"><span style="font:12px/16px monospace">0:01</span></div><p style="margin:0">It was a bright cold day in April, and the clocks were striking thirteen, and the wind swept the dust along the street.</p></div><div class="row" style="align-items:center;font-size:20px;line-height:30px"><span style="font-size:12px;line-height:30px">A</span><p style="margin:0">Centred on a one-line paragraph.</p></div>',
  },
  {
    rule: 'A9',
    bad: '<div class="row" style="width:500px"><span style="flex:1">A name</span><div><button style="height:20px;display:block">Play</button><button style="height:20px;display:block">Rec</button></div></div>',
    good: '<div class="row" style="width:500px"><span style="flex:1">A name</span><div class="row"><button>Play</button><button>Rec</button></div></div>',
  },
  {
    rule: 'G1',
    bad: '<div class="row" style="align-items:flex-start"><section class="card" style="flex:1"><h2>One</h2></section><section class="card" style="flex:1"><h2>Two</h2><p>More</p></section></div>',
    good: '<div class="row" style="align-items:stretch"><section class="card" style="flex:1"><h2>One</h2></section><section class="card" style="flex:1"><h2>Two</h2><p>More</p></section></div>',
  },
  {
    rule: 'G2',
    bad: '<section class="card" style="padding:0"><h2 style="margin:0;padding:0 16px">Files</h2><table style="border-spacing:0"><tr><td style="padding:0 4px">a.wav</td></tr></table></section>',
    good: '<section class="card" style="padding:0"><h2 style="margin:0;padding:0 16px">Files</h2><table style="border-spacing:0"><tr><td style="padding:0 16px">a.wav</td></tr></table></section>',
  },
  {
    rule: 'G4',
    bad: '<div class="row" style="gap:0"><button>a</button><button style="margin-left:8px">b</button><button style="margin-left:16px">c</button></div>',
    good: '<div class="row"><button>a</button><button>b</button><button>c</button></div>',
  },
  {
    rule: 'G5',
    bad: '<section class="card" style="margin-left:16px">One</section><section class="card" style="margin-left:24px">Two</section>',
    good: '<section class="card" style="margin-left:16px">One</section><section class="card" style="margin-left:16px">Two</section>',
  },
  {
    rule: 'H2',
    bad: '<div class="card" style="width:200px;height:80px;padding:16px"><button style="height:auto">Tile</button></div>',
    good: '<div class="card" style="width:200px;height:80px;padding:0"><button style="width:100%;height:100%">Tile</button></div>',
  },
  {
    // The Production board's Rec. column: the label and its info mark are wider than the column's content box (owner report, #2251).
    rule: 'C1',
    bad: '<table style="table-layout:fixed;width:300px;border-collapse:collapse"><tr><th style="width:40px;text-align:center"><span style="white-space:nowrap">Rec. <button style="width:16px;padding:0">i</button></span></th><th>Est.</th></tr></table>',
    good: '<table style="table-layout:fixed;width:300px;border-collapse:collapse"><tr><th style="width:80px;text-align:center"><span style="white-space:nowrap">Rec. <button style="width:16px;padding:0">i</button></span></th><th>Est.</th></tr></table>',
  },
];

for (const { rule, bad, good } of cases) {
  test(`${rule} finds its defect and passes the page laid out right`, async ({ page }) => {
    expect(await rulesOn(page, bad), 'the defect').toContain(rule);
    expect(await rulesOn(page, good), 'laid out right').not.toContain(rule);
  });
}

test("a small margin label set on the text's baseline sits low in its line (A8)", async ({ page }) => {
  expect(
    await rulesOn(
      page,
      '<div style="display:grid;grid-template-columns:76px 600px;font-size:24px;line-height:1.5"><div style="text-align:right"><span style="font:12px/16px monospace">0:02</span></div><p style="margin:0">On the baseline, in the bottom half of the line.</p></div>',
    ),
  ).toContain('A8');
});

test("a control beside a paragraph (a tip's Got it) is not a margin label (A8)", async ({ page }) => {
  expect(
    await rulesOn(
      page,
      '<div class="row" style="align-items:flex-start"><p style="margin:0;font-size:16px;line-height:21px">Select words to edit them.</p><button style="font-size:12px;margin-top:12px">Got it</button></div>',
    ),
  ).not.toContain('A8');
});

test('what is under an open modal is not judged', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<div style="width:90px"><button>Start the recording session</button></div><div role="dialog" aria-modal="true" style="position:fixed;inset:200px"><button>OK</button></div>',
  );
  expect(rules).not.toContain('W1');
});

test('a collapsed rail that fades its labels out is not a cut label', async ({ page }) => {
  const rules = await rulesOn(page, '<nav style="width:40px;overflow:hidden;white-space:nowrap"><span style="opacity:0">Production and more</span></nav>');
  expect(rules).not.toContain('W3');
});

test('a collapsed rail that draws its group labels in a transparent colour is not a cut label', async ({ page }) => {
  const rules = await rulesOn(page, '<nav style="width:40px;overflow:hidden;white-space:nowrap;color:transparent">Production and more</nav>');
  expect(rules).not.toContain('W3');
});

test('a window onto long content (a teleprompter) is not a box cut short', async ({ page }) => {
  const rules = await rulesOn(page, `<div style="height:60px;overflow:hidden">${'<p>A line of the script that goes on.</p>'.repeat(20)}</div>`);
  expect(rules).not.toContain('W3');
});

test('words under an opaque panel opened over them are covered, not overlapped', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<p>Production figures for the week</p><nav style="position:absolute;top:0;left:0;width:200px;height:60px;background:#fff"><span>Schedule</span></nav>',
  );
  expect(rules).not.toContain('W4');
});

test('right-aligned values line up on their right edge', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<dl style="width:300px"><div class="row" style="justify-content:space-between"><dt>Length</dt><dd style="margin:0">4 h</dd></div><div class="row" style="justify-content:space-between"><dt>Length</dt><dd style="margin:0">12 h 30 min</dd></div></dl>',
  );
  expect(rules).not.toContain('A3');
});

test('a divider that sets the last action apart is a separation, not uneven spacing', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<div class="row" style="gap:4px"><button>a</button><button>b</button><button style="margin-left:13px;position:relative">c<i style="position:absolute;left:-9px;top:0;width:1px;height:32px;background:#888"></i></button></div>',
  );
  expect(rules).not.toContain('G4');
});

test('a card under a group rule (an Advanced section) is laid out by its group, not the page gutter', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<section class="card">One</section><div style="border-left:1px solid;padding-left:16px"><section class="card">Two</section></div>',
  );
  expect(rules).not.toContain('G5');
});

test("a heading inside an inset card is that card's title, not the outer card's", async ({ page }) => {
  const table = '<table style="border-spacing:0;margin:0 -16px"><tr><td style="padding:0 16px">Alice</td></tr></table>';
  const inset = '<div style="border:1px solid;padding:12px"><h3 style="margin:0">tired</h3></div>';
  expect(await rulesOn(page, `<section class="card">${inset}<h3 style="margin:0">In this chapter</h3>${table}</section>`)).not.toContain('G2');
  // The outer card's own title still counts: a table set off it is found with an inset card above it.
  expect(await rulesOn(page, `<section class="card">${inset}<h3 style="margin:0;padding-left:8px">In this chapter</h3>${table}</section>`)).toContain('G2');
});

test('a control drawn small with a 24 px press target around it (primitives/hitArea.ts) has a 24 px hit area', async ({ page }) => {
  const rules = await rulesOn(
    page,
    `<style>.hit { position: relative } .hit::after { content: ''; position: absolute; top: 50%; left: 50%; width: 100%; height: 100%; min-width: 24px; min-height: 24px; transform: translate(-50%, -50%) }</style>
     <div class="row" style="gap:6px"><button class="hit" style="height:18px;width:30px;padding:0">x</button><button class="hit" style="height:18px;width:30px;padding:0">y</button></div>`,
  );
  expect(rules).not.toContain('H1');
});

test('an action inside an inset card in its row ends where the card ends', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<div style="width:500px"><div class="row"><span style="flex:1">One</span><button>Edit</button></div><div class="row"><span style="flex:1">Two</span><div style="border:1px solid;padding:12px"><button>Cancel</button></div></div></div>',
  );
  expect(rules).not.toContain('A4');
});

test('a select drawn at the field width is not a row action', async ({ page }) => {
  const rules = await rulesOn(
    page,
    '<div style="width:500px"><div class="row"><span style="flex:1">One</span><button>Edit</button></div><div class="row"><span style="flex:1">Two</span><select style="width:200px;margin-right:60px"><option>System default</option></select></div></div>',
  );
  expect(rules).not.toContain('A4');
});
