"""Median over runs of wall, max RSS, in-process total, and p50/p99/mean ns per partial|word feed."""
import json, re, statistics, sys
from pathlib import Path

d = Path(sys.argv[1])
def wall(t):
    m = re.search(r"Elapsed \(wall clock\) time .*: (?:(\d+):)?(\d+):([\d.]+)", t)
    h, mnt, s = m.groups()
    return (int(h or 0) * 3600 + int(mnt) * 60 + float(s))
rows = {}
for impl in ("py", "go"):
    stats = []
    for tf in sorted(d.glob(f"{impl}_*.time")):
        t = tf.read_text()
        rss = int(re.search(r"Maximum resident set size \(kbytes\): (\d+)", t).group(1))
        tim = json.loads(Path(str(tf)[:-5] + ".jsonl.timing").read_text())
        f = sorted(tim["feeds"])
        q = lambda p: f[min(len(f) - 1, int(p * len(f)))]
        stats.append((wall(t), rss, tim["total_ns"] / 1e9, q(0.5) / 1e3, q(0.99) / 1e3, sum(f) / len(f) / 1e3, len(f)))
    rows[impl] = [statistics.median(col) for col in zip(*stats)]
print(f"{'impl':4} {'wall s':>8} {'maxRSS MB':>10} {'in-proc s':>10} {'p50 us':>8} {'p99 us':>8} {'mean us':>8} {'feeds':>7}")
for impl, r in rows.items():
    print(f"{impl:4} {r[0]:8.3f} {r[1]/1024:10.1f} {r[2]:10.3f} {r[3]:8.2f} {r[4]:8.2f} {r[5]:8.2f} {int(r[6]):7d}")
p, g = rows["py"], rows["go"]
print(f"speedup: wall x{p[0]/g[0]:.1f}, in-proc x{p[2]/g[2]:.1f}, p50 x{p[3]/g[3]:.1f}, p99 x{p[4]/g[4]:.1f}; RSS ratio x{p[1]/g[1]:.1f}")
