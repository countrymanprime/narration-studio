/* The docs pages' script (scripts/site/guides.mjs inlines it after the shell's), cut from the docs view of the public-site mock: the
   phone page picker, smooth scrolling to a heading, "On this page" following the reading position, the copy button and the feedback line. */
(() => {
  'use strict';
  const { $, $$, RM } = window.Site;
  const sel = $('#doc-sel');
  if (sel) {
    sel.onchange = (e) => {
      // The value is a docs page name from the picker's own options; anything else (a scheme, a path) is ignored.
      if (/^[a-z0-9-]+$/.test(e.target.value)) location.assign(e.target.value + '.html');
    };
  }
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sc]');
    if (s) {
      e.preventDefault();
      const t = document.getElementById(s.dataset.sc);
      if (t) {
        t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
        try {
          history.replaceState(null, '', '#' + t.id);
        } catch (err) {}
      }
    }
    const f = e.target.closest('[data-fb]');
    if (f) {
      $('#fb').textContent = f.dataset.fb === 'y' ? 'Thanks, glad it helped.' : 'Thanks. Tell us what was missing on GitHub.';
    }
    const b = e.target.closest('[data-copy]');
    if (b) {
      const txt = b.closest('.codebox').querySelector('code').textContent;
      const done = () => {
        b.textContent = 'Copied';
        setTimeout(() => (b.textContent = 'Copy'), 1400);
      };
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(done, () => {
        const r = document.createRange();
        r.selectNodeContents(b.closest('.codebox').querySelector('code'));
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        b.textContent = 'Selected';
      });
    }
  });
  const hs = $$('#doc-article h2[id]');
  const spy = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          $$('#doc-toc a').forEach((a) => a.classList.toggle('on', a.dataset.sc === e.target.id));
        }
      }),
    { rootMargin: '-20% 0px -70% 0px' },
  );
  hs.forEach((h) => spy.observe(h));
})();
