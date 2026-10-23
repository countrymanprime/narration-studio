import re, sys, difflib
ref = open('/home/user/narration-studio/apps/ui/src/api/fixtures/alice-in-wonderland.txt', encoding='utf-8').read()
tok = lambda s: re.findall(r"[a-z0-9']+", s.lower().replace('’', "'"))
r = tok(ref)
for f in sys.argv[1:]:
    h = tok(open(f).read())
    # Reference window: chapter I text from its first sentence, as long as the hypothesis plus slack.
    i = max(k for k in range(len(r)) if r[k:k+5] == ['alice','was','beginning','to','get'])
    ref_w = r[i:i+len(h)+40]
    sm = difflib.SequenceMatcher(None, ref_w, h, autojunk=False)
    errs = sum(max(i2-i1, j2-j1) for t,i1,i2,j1,j2 in sm.get_opcodes() if t != 'equal')
    # Trim trailing slack: count only up to last matched ref word.
    last = max(b.a + b.size for b in sm.get_matching_blocks() if b.size)
    print(f, len(h), 'words, approx WER', round(errs / last, 3))
