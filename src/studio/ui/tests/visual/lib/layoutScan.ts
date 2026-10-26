// The alignment audit's DOM rules (docs/research/alignment-audit.md#alignment-rules), measured on the page as it is drawn. `scanLayout`
// runs in the browser (page.evaluate), so it is self-contained: no imports, no helpers outside its body.
// W5 (nothing under a scrollbar) is not measured: Playwright's headless Chromium draws no scrollbars, so it could never fail here.

export type LayoutRule =
  'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A7' | 'A8' | 'A9' | 'W1' | 'W2' | 'W3' | 'W4' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'H1' | 'H2' | 'B1';

export interface LayoutHit {
  rule: LayoutRule;
  /** A short CSS path to the element the hit is about. */
  where: string;
  /** What was measured, in words. */
  detail: string;
}

export function scanLayout(): LayoutHit[] {
  const hits: LayoutHit[] = [];
  const TOL = 1;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const vw = innerWidth;
  const vh = innerHeight;

  const pathOf = (element: Element): string => {
    const parts: string[] = [];
    let node: Element | null = element;
    for (let depth = 0; node && node !== document.body && depth < 5; depth += 1) {
      let part = node.tagName.toLowerCase();
      // An id a library generates (Base UI's `base-ui-_r_1j_`) changes from load to load, so it does not name a place.
      if (node.id && !/^base-ui-|_r_/.test(node.id)) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const label = node.getAttribute('aria-label');
      if (label) part += `[aria-label="${label.slice(0, 40)}"]`;
      else {
        const parent: Element | null = node.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter((sibling) => sibling.tagName === node!.tagName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const textOf = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const hit = (rule: LayoutRule, element: Element, detail: string) => hits.push({ rule, where: pathOf(element), detail });

  // The layer a person sees: the topmost open modal when there is one (what is behind it is not judged), else the app.
  const modals = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]'),
  ).filter((element) => element.getClientRects().length > 0);
  const scope: Element = modals.at(-1) ?? document.getElementById('root') ?? document.body;

  const faded = new Map<Element, boolean>();
  // An element is invisible when it or any ancestor is fully transparent (a collapsed rail fades its labels out).
  const transparent = (element: Element | null): boolean => {
    if (!element) return false;
    let known = faded.get(element);
    if (known === undefined) faded.set(element, (known = Number(getComputedStyle(element).opacity) === 0 || transparent(element.parentElement)));
    return known;
  };
  const shown = (element: Element): boolean => {
    if (element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || transparent(element)) return false;
    if (element.closest('[aria-hidden="true"], [inert]')) return false;
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) return false;
    return box.bottom > 0 && box.top < vh && box.right > 0 && box.left < vw;
  };
  // A box drawn under something else at its centre (a drawer over the page, a toast) is not what a person sees there.
  const onTop = (element: Element): boolean => {
    const box = element.getBoundingClientRect();
    const x = Math.min(Math.max(box.left + box.width / 2, 0), vw - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 0), vh - 1);
    const top = document.elementFromPoint(x, y);
    return !!top && (top === element || element.contains(top) || top.contains(element));
  };

  // A chart's own marks and labels (inside an <svg>) are drawn to its data, not laid out as rows; the chart box itself is measured.
  const all = Array.from(scope.querySelectorAll<HTMLElement>('*')).filter(
    (element) => !element.parentElement?.closest('svg') && shown(element) && onTop(element),
  );
  const styleOf = new Map<Element, CSSStyleDeclaration>();
  const css = (element: Element) => {
    let style = styleOf.get(element);
    if (!style) styleOf.set(element, (style = getComputedStyle(element)));
    return style;
  };

  // The part of the window an element can be seen in: the viewport cut by every ancestor that does not let its content overflow.
  const clipOf = (element: Element): { left: number; top: number; right: number; bottom: number } => {
    const clip = { left: 0, top: 0, right: vw, bottom: vh };
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = css(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const box = node.getBoundingClientRect();
      const left = box.left + node.clientLeft;
      const top = box.top + node.clientTop;
      if (style.overflowX !== 'visible') {
        clip.left = Math.max(clip.left, left);
        clip.right = Math.min(clip.right, left + node.clientWidth);
      }
      if (style.overflowY !== 'visible') {
        clip.top = Math.max(clip.top, top);
        clip.bottom = Math.min(clip.bottom, top + node.clientHeight);
      }
    }
    return clip;
  };
  // Text drawn in a transparent colour or at no size is not seen (the collapsed rail hides its group labels that way).
  const inkless = (element: Element) => {
    const style = css(element);
    return parseFloat(style.fontSize) === 0 || /rgba\([^)]*,\s*0\)$/.test(style.color) || style.color === 'transparent';
  };
  // Elements laid out as blocks (a row, a card), not words in a line of text.
  const blockish = (element: Element) => /^(block|flex|grid|list-item|table|table-row|flow-root)$/.test(css(element).display);

  // ---- W1: a button, tab or chip label does not wrap. A text node of the control laid out on more than one line is a wrapped label.
  const CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]';
  const lineCount = (node: Text): number => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const tops = new Set<number>();
    for (const rect of range.getClientRects()) if (rect.width > 0.5) tops.add(Math.round(rect.top / 4));
    return tops.size;
  };
  const wrappedTextIn = (element: Element): Text | undefined => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null)
      if ((node.textContent ?? '').trim().includes(' ') && lineCount(node) > 1) return node;
    return undefined;
  };
  for (const element of all.filter((candidate) => candidate.matches(CONTROL))) {
    // A control built of blocks (a list row's button with a title line and a facts line) lays out text, not a label.
    if (Array.from(element.querySelectorAll('*')).some((child) => blockish(child) && (child.textContent ?? '').trim())) continue;
    const wrapped = wrappedTextIn(element);
    if (wrapped) hit('W1', element, `"${textOf(element)}" wraps its label ("${(wrapped.textContent ?? '').trim().slice(0, 30)}")`);
  }

  // ---- W2: no truncation while free space exists beside the element (a flex row with room left over).
  for (const element of all) {
    const style = css(element);
    if (style.textOverflow !== 'ellipsis' || element.scrollWidth <= element.clientWidth + TOL) continue;
    const parent = element.parentElement;
    if (!parent) continue;
    const parentStyle = css(parent);
    if (!parentStyle.display.includes('flex') || parentStyle.flexDirection.startsWith('column')) continue;
    const inner = parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
    const kids = Array.from(parent.children).filter((child) => child.getClientRects().length > 0 && css(child).position !== 'absolute');
    const used =
      kids.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) + (parseFloat(parentStyle.columnGap) || 0) * Math.max(kids.length - 1, 0);
    if (inner - used > 8) hit('W2', element, `"${textOf(element)}" is cut with ${r1(inner - used)}px free in its row`);
  }

  // ---- W3: nothing is clipped by an ancestor: a box that hides its overflow and has more content than room, without an ellipsis or a
  // line clamp that says so. Scrolling boxes are not clipping.
  for (const element of all) {
    const style = css(element);
    const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    if (!clipsX && !clipsY) continue;
    if (style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none') continue;
    if (element.clientWidth <= 2 || element.clientHeight <= 2) continue;
    const overX = clipsX ? element.scrollWidth - element.clientWidth : 0;
    const overY = clipsY ? element.scrollHeight - element.clientHeight : 0;
    if (overX <= TOL && overY <= TOL) continue;
    // A box that hides more than it shows is a window onto long content (the Booth's teleprompter), not a box cut short.
    if (overY > element.clientHeight || overX > element.clientWidth) continue;
    // Content wholly hidden (a collapsed rail's labels) is not seen; a line of text cut through at the edge is.
    const box = element.getBoundingClientRect();
    const inner = { left: box.left + element.clientLeft, top: box.top + element.clientTop };
    const edge = { right: inner.left + element.clientWidth, bottom: inner.top + element.clientHeight };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!(node.textContent ?? '').trim() || !node.parentElement || !shown(node.parentElement) || inkless(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const cut = Array.from(range.getClientRects()).find(
        (rect) =>
          rect.width > 1 &&
          ((clipsX && rect.left < edge.right - TOL && rect.right > edge.right + TOL) ||
            (clipsY && rect.top < edge.bottom - TOL && rect.bottom > edge.bottom + TOL) ||
            (clipsX && rect.right > inner.left + TOL && rect.left < inner.left - TOL)),
      );
      if (cut) {
        hit('W3', element, `cuts "${(node.textContent ?? '').trim().slice(0, 30)}" at its edge`);
        break;
      }
    }
  }

  // ---- W4: no two text runs overlap. Each text node's line boxes against every other's, in the same layer (an overlay drawn over the
  // page is judged by onTop, not here).
  interface Run {
    node: Text;
    owner: Element;
    rects: { left: number; top: number; right: number; bottom: number }[];
    layer: Element | null;
  }
  const layerOf = (element: Element): Element | null => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const position = css(node).position;
      if (position === 'fixed' || position === 'sticky' || (position === 'absolute' && css(node).zIndex !== 'auto')) return node;
    }
    return null;
  };
  const runs: Run[] = [];
  {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!(node.textContent ?? '').trim()) continue;
      const owner = node.parentElement;
      if (!owner || !shown(owner) || inkless(owner)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const clip = clipOf(owner);
      const rects = Array.from(range.getClientRects())
        .map((rect) => ({
          left: Math.max(rect.left, clip.left),
          top: Math.max(rect.top, clip.top),
          right: Math.min(rect.right, clip.right),
          bottom: Math.min(rect.bottom, clip.bottom),
        }))
        .filter((rect) => rect.right - rect.left > 1 && rect.bottom - rect.top > 1);
      if (rects.length) runs.push({ node, owner, rects, layer: layerOf(owner) });
    }
  }
  // Runs in 64 px bands of the window, so only runs that share a band are compared.
  const bands = new Map<number, Run[]>();
  for (const run of runs)
    for (const band of new Set(run.rects.flatMap((rect) => [Math.floor(rect.top / 64), Math.floor(rect.bottom / 64)])))
      bands.set(band, [...(bands.get(band) ?? []), run]);
  const compared = new Set<string>();
  const index = new Map(runs.map((run, i) => [run, i]));
  for (const band of bands.values())
    for (let i = 0; i < band.length; i += 1)
      for (let j = i + 1; j < band.length; j += 1) {
        const a = band[i];
        const b = band[j];
        const pair = `${index.get(a)} ${index.get(b)}`;
        if (compared.has(pair)) continue;
        compared.add(pair);
        if (a.owner === b.owner || a.layer !== b.layer) continue;
        // Where the two runs cross, one of them is what is drawn on top; anything else there (a drawer, a toast) covers both.
        let crossing: { x: number; y: number } | undefined;
        for (const ra of a.rects)
          for (const rb of b.rects) {
            const left = Math.max(ra.left, rb.left);
            const right = Math.min(ra.right, rb.right);
            const top = Math.max(ra.top, rb.top);
            const bottom = Math.min(ra.bottom, rb.bottom);
            if (!crossing && right - left > 2 && bottom - top > 2) crossing = { x: (left + right) / 2, y: (top + bottom) / 2 };
          }
        if (!crossing) continue;
        // Both runs must be drawn there: nothing with a background of its own may lie between them in the paint order (the rail opened
        // over the page covers the page's words, it does not overlap them).
        const stack = document.elementsFromPoint(crossing.x, crossing.y);
        const at = (owner: Element) => stack.findIndex((element) => element === owner || owner.contains(element));
        const [upper, lower] = [at(a.owner), at(b.owner)].sort((x, y) => x - y);
        if (upper < 0 || lower < 0) continue;
        const lowerOwner = at(a.owner) === lower ? a.owner : b.owner;
        const covered = stack
          .slice(upper, lower)
          .some((element) => !element.contains(lowerOwner) && !/rgba\([^)]*,\s*0\)$|transparent/.test(css(element).backgroundColor));
        if (covered) continue;
        hit('W4', a.owner, `"${(a.node.textContent ?? '').trim().slice(0, 30)}" overlaps "${(b.node.textContent ?? '').trim().slice(0, 30)}"`);
      }

  // ---- H1: a hit area is at least 24 px (WCAG 2.5.8), unless it is a link in a run of text or a 24 px circle on it meets no other target.
  const TARGET =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="link"], [role="slider"]';
  const targets = all.filter((element) => element.matches(TARGET) && !element.closest('label')?.matches(':not(:has(input:only-child))'));
  const boxOfTarget = (element: Element): DOMRect => {
    const label = (element as HTMLInputElement).labels?.[0];
    const box = label && shown(label) && label.contains(element) ? label.getBoundingClientRect() : element.getBoundingClientRect();
    // A control drawn small can carry a larger invisible press target: an absolutely placed ::after centred on it (primitives/hitArea.ts).
    // It takes the presses, so it is the hit area.
    const after = getComputedStyle(element, '::after');
    if (after.position !== 'absolute' || after.content === 'none') return box;
    const width = Math.max(box.width, parseFloat(after.width) || 0);
    const height = Math.max(box.height, parseFloat(after.height) || 0);
    return new DOMRect(box.left + box.width / 2 - width / 2, box.top + box.height / 2 - height / 2, width, height);
  };
  const inRunOfText = (element: Element): boolean => {
    const parent = element.parentElement;
    if (!parent || !css(element).display.startsWith('inline') || css(element).display === 'inline-flex') return false;
    return Array.from(parent.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0);
  };
  const boxes = targets.map((element) => ({ element, box: boxOfTarget(element) }));
  for (const { element, box } of boxes) {
    if (box.width >= 24 - 0.5 && box.height >= 24 - 0.5) continue;
    if (inRunOfText(element)) continue;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const crowded = boxes.some(({ element: other, box: ob }) => {
      if (other === element || other.contains(element) || element.contains(other)) return false;
      const small = ob.width < 23.5 || ob.height < 23.5;
      const ox = Math.max(ob.left, Math.min(cx, ob.right));
      const oy = Math.max(ob.top, Math.min(cy, ob.bottom));
      if (Math.hypot(cx - ox, cy - oy) < 12) return true;
      return small && Math.hypot(cx - (ob.left + ob.width / 2), cy - (ob.top + ob.height / 2)) < 24;
    });
    if (crowded)
      hit('H1', element, `"${textOf(element) || element.getAttribute('aria-label') || ''}" is ${r1(box.width)}x${r1(box.height)}px beside another target`);
  }

  // ---- H2: a hover or click wrapper spans its card: an interactive element that is the only thing in a framed box stops short of it.
  const framed = (element: Element) => {
    const style = css(element);
    return parseFloat(style.borderTopWidth) > 0 || (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent');
  };
  for (const element of all) {
    if (!element.matches(TARGET) && css(element).cursor !== 'pointer') continue;
    const parent = element.parentElement;
    if (!parent || parent.children.length !== 1 || !framed(parent) || parent.matches(TARGET)) continue;
    const pb = parent.getBoundingClientRect();
    const eb = element.getBoundingClientRect();
    const short = Math.max(
      eb.left - pb.left - parent.clientLeft,
      pb.right - eb.right - parent.clientLeft,
      eb.top - pb.top - parent.clientTop,
      pb.bottom - eb.bottom - parent.clientTop,
    );
    if (short > 2 && pb.width > 48 && pb.height > 32) hit('H2', element, `"${textOf(element)}" stops ${r1(short)}px short of its card`);
  }

  // ---- Repeated rows (A1 to A5, A9): siblings of one parent with the same tag and class, stacked one under another.
  const visibleKids = (element: Element) =>
    Array.from(element.children).filter((child) => shown(child) && css(child).position !== 'absolute' && css(child).position !== 'fixed');
  const rowKids = (element: Element) => visibleKids(element).filter(blockish);
  const signature = (element: Element) => `${element.tagName}.${element.getAttribute('class') ?? ''}`;
  const parents = new Set(all.map((element) => element.parentElement).filter((parent): parent is HTMLElement => !!parent));
  for (const parent of parents) {
    const groups = new Map<string, Element[]>();
    for (const child of rowKids(parent)) groups.set(signature(child), [...(groups.get(signature(child)) ?? []), child]);
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      const rects = rows.map((row) => row.getBoundingClientRect());
      const stacked = rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom - TOL);
      if (!stacked) continue;
      const lefts = rects.map((rect) => rect.left);
      const rights = rects.map((rect) => rect.right);
      const columns = css(parent).display.includes('grid') ? css(parent).gridTemplateColumns.split(' ').length : 1;
      const oneColumn =
        columns === 1 && !(css(parent).display.includes('flex') && css(parent).flexWrap !== 'nowrap' && !css(parent).flexDirection.startsWith('column'));
      if (oneColumn && Math.max(...lefts) - Math.min(...lefts) > TOL) hit('A1', parent, `like rows start at ${[...new Set(lefts.map(r1))].join(', ')}`);
      const inner = parent.clientWidth - parseFloat(css(parent).paddingLeft) - parseFloat(css(parent).paddingRight);
      const spanning = rects.every((rect) => rect.width >= inner * 0.75);
      if (oneColumn && spanning && Math.max(...rights) - Math.min(...rights) > TOL)
        hit('A2', parent, `like rows end at ${[...new Set(rights.map(r1))].join(', ')}`);
      // A3: rows with the same number of cells put each cell at the same x.
      // Cells laid out as blocks; words in a line of text are not columns.
      const cells = rows.map((row) =>
        visibleKids(row).filter(
          (cell) => !css(cell).display.startsWith('inline') || css(cell).display === 'inline-flex' || css(cell).display === 'inline-grid',
        ),
      );
      // A row that wraps its items (a run of words, chips) is a flow, not a grid.
      const flows = rows.some((row) => css(row).flexWrap === 'wrap');
      if (!flows && cells[0].length > 1 && cells.every((row) => row.length === cells[0].length)) {
        for (let index = 0; index < cells[0].length; index += 1) {
          const boxes = cells.map((row) => row[index].getBoundingClientRect());
          const xs = boxes.map((box) => box.left);
          const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
          // A column lines up on its left edge, its right edge (right-aligned values) or its centre.
          if (spread(xs) > TOL && spread(boxes.map((box) => box.right)) > TOL && spread(boxes.map((box) => box.left + box.width / 2)) > TOL) {
            hit('A3', parent, `cell ${index + 1} of like rows starts at ${[...new Set(xs.map(r1))].join(', ')}`);
            break;
          }
        }
      }
      // A4: each row's last control ends at one x.
      // Actions only: a select or text box is drawn at the field width (design-system.md, Settings rows), not to the row's end.
      const ACTION = 'button, [role="button"], a[href]';
      const lastControls = rows.map((row) => Array.from(row.querySelectorAll(ACTION)).filter(shown).at(-1)).filter((control): control is Element => !!control);
      // A control inside an inset card in the row ends where that card ends: the card's own padding is not a misalignment.
      const endOf = (control: Element, row: Element) => {
        let end = control.getBoundingClientRect().right;
        for (let node = control.parentElement; node && node !== row; node = node.parentElement)
          if (parseFloat(css(node).borderRightWidth) > 0) end = node.getBoundingClientRect().right;
        return end;
      };
      const ends = lastControls.map((control, i) => endOf(control, rows[i]));
      const endsInAction = ends.every((end, i) => rects[i].right - end <= 48);
      if (lastControls.length === rows.length && endsInAction) {
        if (Math.max(...ends) - Math.min(...ends) > TOL) hit('A4', parent, `row actions end at ${[...new Set(ends.map(r1))].join(', ')}`);
      }
      // A5: rows built alike, each line of text on one line, are one height.
      const shape = (row: Element) => Array.from(row.querySelectorAll('*')).map(signature).join('|');
      const oneLine = (row: Element) => {
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null)
          if ((node.textContent ?? '').trim() && lineCount(node) > 1) return false;
        return true;
      };
      if (rows.every((row) => shape(row) === shape(rows[0]) && oneLine(row))) {
        const heights = rects.map((rect) => rect.height);
        if (Math.max(...heights) - Math.min(...heights) > TOL) hit('A5', parent, `like rows are ${[...new Set(heights.map(r1))].join(', ')}px tall`);
      }
    }
  }

  // ---- A7: controls on one row share a centre line (their boxes overlap by half or more, yet their centres differ).
  const controls = all.filter((element) => element.matches('button, input, select, [role="button"], [role="combobox"]') && !inRunOfText(element));
  const byParent = new Map<Element, Element[]>();
  for (const control of controls) if (control.parentElement) byParent.set(control.parentElement, [...(byParent.get(control.parentElement) ?? []), control]);
  for (const siblings of byParent.values())
    for (let i = 0; i < siblings.length; i += 1)
      for (let j = i + 1; j < siblings.length; j += 1) {
        const a = siblings[i].getBoundingClientRect();
        const b = siblings[j].getBoundingClientRect();
        const shared = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const centres = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2));
        if (shared >= Math.min(a.height, b.height) / 2 && centres > TOL)
          hit('A7', siblings[i], `"${textOf(siblings[i])}" and "${textOf(siblings[j])}" are ${r1(centres)}px off one centre line`);
      }

  // ---- A8: a margin label (a paragraph's time, speaker or line number) is centred on the first line of the text beside it. The text is
  // a <p> in a grid or flex row; the label is the smaller text of a sibling cell, on one line. Its glyph box (its font's ascent and descent,
  // which half-leading centres in any line box) must sit inside the first line's box with its centre on that box's centre: a smaller label
  // put on the text's baseline reads as sitting low (the owner's report on the Editing page's times, #2094).
  const drawn = new Set<Element>(all);
  for (const text of all) {
    if (text.tagName !== 'P' || !text.parentElement) continue;
    const row = css(text.parentElement);
    if (row.display !== 'grid' && !(row.display === 'flex' && row.flexDirection.startsWith('row'))) continue;
    const lineHeight = parseFloat(css(text).lineHeight);
    if (!(lineHeight > 0)) continue;
    const box = text.getBoundingClientRect();
    const lineTop = box.top + text.clientTop + parseFloat(css(text).paddingTop);
    const line = { top: lineTop, bottom: lineTop + lineHeight };
    for (const cell of Array.from(text.parentElement.children)) {
      if (cell === text || !drawn.has(cell) || cell.querySelector('p')) continue;
      const cellBox = cell.getBoundingClientRect();
      // Beside the text, not above or under it.
      if (cellBox.right > box.left + TOL && cellBox.left < box.right - TOL) continue;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const label = node.parentElement;
        if (!label || !node.data.trim() || !drawn.has(label) || inkless(label) || lineCount(node) !== 1) continue;
        if (parseFloat(css(label).fontSize) >= parseFloat(css(text).fontSize)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const ink = range.getBoundingClientRect();
        const inside = ink.top >= line.top - TOL && ink.bottom <= line.bottom + TOL;
        const centred = Math.abs(ink.top + ink.height / 2 - (line.top + lineHeight / 2)) <= TOL;
        if (!inside || !centred)
          hit(
            'A8',
            label,
            `"${node.data.trim().slice(0, 20)}" runs ${r1(ink.top - line.top)} to ${r1(ink.bottom - line.top)}px against the first line's 0 to ${r1(lineHeight)}px, off its centre`,
          );
        break;
      }
    }
  }

  // ---- A9: no small controls stacked in a column beside their row: a box in a horizontal row that holds two or more controls one above
  // the other.
  for (const element of all) {
    const parent = element.parentElement;
    if (!parent || visibleKids(parent).length < 2) continue;
    const parentStyle = css(parent);
    if (!parentStyle.display.includes('flex') || parentStyle.flexDirection.startsWith('column') || parent.getBoundingClientRect().height > 160) continue;
    const inside = Array.from(element.querySelectorAll('button, a[href], [role="button"]')).filter(shown);
    if (inside.length < 2 || inside.length > 4 || inside.some((control) => control.getBoundingClientRect().height > 32)) continue;
    const rects = inside.map((control) => control.getBoundingClientRect());
    const column = rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom - TOL);
    if (column && element.getBoundingClientRect().height > 1.6 * Math.max(...rects.map((rect) => rect.height)))
      hit('A9', element, `${inside.length} controls stacked in a column beside their row ("${textOf(element)}")`);
  }

  // ---- Cards (G1, G2, G5, B1): the Panel frame and other bordered sections.
  // Cards of the page itself: an overlay (a toast, a popover) is not laid out with them.
  // Measured whether or not something is drawn over them: a panel covering part of a card does not move it.
  const cards = Array.from(scope.querySelectorAll<HTMLElement>('section, article, [role="region"]')).filter(
    (element) => shown(element) && framed(element) && parseFloat(css(element).borderTopWidth) > 0 && layerOf(element) === null,
  );
  // G1: sibling cards on one row have one height and one header height.
  const cardRows = new Map<Element, Element[]>();
  for (const card of cards) if (card.parentElement) cardRows.set(card.parentElement, [...(cardRows.get(card.parentElement) ?? []), card]);
  for (const [parent, siblings] of cardRows) {
    const rows = new Map<number, Element[]>();
    for (const card of siblings) {
      const top = Math.round(card.getBoundingClientRect().top);
      const key = [...rows.keys()].find((existing) => Math.abs(existing - top) <= TOL) ?? top;
      rows.set(key, [...(rows.get(key) ?? []), card]);
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const heights = row.map((card) => card.getBoundingClientRect().height);
      if (Math.max(...heights) - Math.min(...heights) > TOL) {
        hit('G1', parent, `cards on one row are ${heights.map(r1).join(', ')}px tall`);
        // B1: the shorter card leaves a blank of more than 120 px beside its neighbour.
        if (Math.max(...heights) - Math.min(...heights) > 120)
          hit('B1', parent, `${r1(Math.max(...heights) - Math.min(...heights))}px of blank beside the taller card`);
      }
      const headers = row.map((card) => card.querySelector(':scope > header, :scope > div:first-child'));
      if (headers.every((header) => header && header.querySelector('h2, h3'))) {
        const hh = headers.map((header) => header!.getBoundingClientRect().height);
        if (Math.max(...hh) - Math.min(...hh) > TOL) hit('G1', parent, `card headers on one row are ${hh.map(r1).join(', ')}px tall`);
      }
    }
  }
  // G2: a flush table's text starts where its card title starts.
  // The card's own title: a heading inside a framed card within it (the Script rail's Word card) is that inner card's title, set in by its frame.
  const inFrameWithin = (element: Element, card: Element) => {
    for (let node = element.parentElement; node && node !== card; node = node.parentElement) if (parseFloat(css(node).borderLeftWidth) > 0) return true;
    return false;
  };
  for (const card of cards) {
    const title = Array.from(card.querySelectorAll('h2, h3')).find((heading) => !inFrameWithin(heading, card));
    const table = card.querySelector('table');
    if (!title || !table || !shown(table)) continue;
    const cardInner = card.getBoundingClientRect().left + card.clientLeft;
    if (Math.abs(table.getBoundingClientRect().left - cardInner) > TOL) continue;
    const cell = table.querySelector('tr > :first-child');
    if (!cell) continue;
    // Where the cell's content starts (its padding box), so a right-aligned figure column is judged by its inset, not its text.
    const textLeft = cell.getBoundingClientRect().left + cell.clientLeft + parseFloat(css(cell).paddingLeft);
    const titleRange = document.createRange();
    titleRange.selectNodeContents(title);
    const titleLeft = titleRange.getBoundingClientRect().left;
    if (Math.abs(textLeft - titleLeft) > TOL) hit('G2', table, `table text starts at ${r1(textLeft)}, the card title at ${r1(titleLeft)}`);
  }
  // G5: top-level cards share the page gutter: every card in <main> that is the first of its row starts at one x.
  const main = scope.querySelector('main') ?? (scope.matches('main') ? scope : null);
  if (main) {
    // A card inside a frame or under a group's rule (Settings' Advanced) is laid out by that container, not by the page gutter.
    const nested = (card: Element) => {
      for (let node = card.parentElement; node && node !== main; node = node.parentElement) if (parseFloat(css(node).borderLeftWidth) > 0) return true;
      return false;
    };
    const topCards = cards.filter((card) => main.contains(card) && !nested(card));
    const firsts = topCards.filter((card) => {
      const box = card.getBoundingClientRect();
      return !topCards.some((other) => {
        const ob = other.getBoundingClientRect();
        return other !== card && ob.right <= box.left + TOL && Math.min(ob.bottom, box.bottom) - Math.max(ob.top, box.top) > 0;
      });
    });
    const lefts = firsts.map((card) => card.getBoundingClientRect().left);
    if (lefts.length > 1 && Math.max(...lefts) - Math.min(...lefts) > TOL)
      hit('G5', main, `first cards of their rows start at ${[...new Set(lefts.map(r1))].join(', ')}`);
  }

  // ---- G3: a selection bar (a toolbar shown for a selection) spans the width of the block it acts on, its next sibling.
  for (const bar of all.filter((element) => element.matches('[role="toolbar"]'))) {
    const next = bar.nextElementSibling;
    if (!next || !shown(next) || !/select/i.test(bar.getAttribute('aria-label') ?? '')) continue;
    const a = bar.getBoundingClientRect();
    const b = next.getBoundingClientRect();
    if (Math.abs(a.left - b.left) > TOL || Math.abs(a.right - b.right) > TOL)
      hit('G3', bar, `the selection bar spans ${r1(a.left)} to ${r1(a.right)}, the block under it ${r1(b.left)} to ${r1(b.right)}`);
  }

  // ---- G4: gaps between like siblings on one line are equal.
  for (const parent of parents) {
    const kids = visibleKids(parent);
    if (kids.length < 3 || !css(parent).display.match(/flex|grid/)) continue;
    const groups = new Map<string, Element[]>();
    for (const kid of kids) groups.set(signature(kid), [...(groups.get(signature(kid)) ?? []), kid]);
    for (const like of groups.values()) {
      if (like.length < 3 || like.length !== kids.length) continue;
      const rects = like.map((kid) => kid.getBoundingClientRect());
      const horizontal = rects.every((rect) => Math.abs(rect.top - rects[0].top) <= TOL);
      const vertical = rects.every((rect) => Math.abs(rect.left - rects[0].left) <= TOL);
      if (!horizontal && !vertical) continue;
      // A gap with something drawn in it (a divider setting the last action apart) is a separation, not uneven spacing.
      const plain = (a: DOMRect, b: DOMRect) => {
        const x = horizontal ? (a.right + b.left) / 2 : a.left + a.width / 2;
        const y = horizontal ? a.top + a.height / 2 : (a.bottom + b.top) / 2;
        const there = document.elementFromPoint(x, y);
        return !there || there === parent || there.contains(parent);
      };
      const gaps = rects
        .slice(1)
        .map((rect, index) => ({ gap: horizontal ? rect.left - rects[index].right : rect.top - rects[index].bottom, plain: plain(rects[index], rect) }))
        .filter((entry) => entry.plain)
        .map((entry) => entry.gap);
      if (gaps.length < 2) continue;
      if (Math.max(...gaps) - Math.min(...gaps) > TOL) hit('G4', parent, `gaps between like items are ${[...new Set(gaps.map(r1))].join(', ')}px`);
    }
  }

  // One hit per rule and place.
  const seen = new Set<string>();
  return hits.filter((entry) => {
    const key = `${entry.rule} ${entry.where}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
