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
];

for (const { rule, bad, good } of cases) {
  test(`${rule} finds its defect and passes the page laid out right`, async ({ page }) => {
    expect(await rulesOn(page, bad), 'the defect').toContain(rule);
    expect(await rulesOn(page, good), 'laid out right').not.toContain(rule);
  });
}

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
