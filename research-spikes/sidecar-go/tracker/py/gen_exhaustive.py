"""Every code point (no surrogates) through normalize_word alone, as 'A'+c+'Σ' and as 'AΣ'+c (sigma context)."""
import json, sys
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    for c in range(0x110000):
        if 0xD800 <= c <= 0xDFFF:
            continue
        ch = chr(c)
        for w in (ch, "A" + ch + "Σ", "AΣ" + ch):
            fh.write(json.dumps({"k": "norm", "w": w}) + "\n")
