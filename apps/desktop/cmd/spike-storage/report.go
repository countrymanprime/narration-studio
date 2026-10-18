package main

import (
	"fmt"
	"runtime/debug"
	"sort"
	"strings"
)

func driverVersions() map[string]string {
	out := map[string]string{}
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, d := range bi.Deps {
			switch d.Path {
			case "modernc.org/sqlite", "github.com/ncruces/go-sqlite3", "github.com/ncruces/go-sqlite3-wasm/v6", "go.etcd.io/bbolt":
				out[d.Path] = d.Version
			}
		}
		out["go"] = bi.GoVersion
	}
	return out
}

func mb(n int64) string { return fmt.Sprintf("%.1f", float64(n)/1048576) }

// renderMarkdown turns the results into the tables the research note quotes.
func renderMarkdown(a *AllResults) string {
	var b strings.Builder
	m := a.Meta
	fmt.Fprintf(&b, "### Dataset `%s` (%s)\n\n", m.Scale.Name, a.When)
	fmt.Fprintf(&b, "%d chapters, %d script words, %d paragraphs, %d ASR words over %d takes, %d findings, %d decisions, %d marks, %d pickups, %d Story Bible entries, %.1f h of audio, generated in %.1f s.\n\n", m.Scale.Chapters, m.ScriptWords, m.Paragraphs, m.ASRWords, m.Takes, m.Findings, m.Decisions, m.Marks, m.Pickups, m.Entities, m.AudioSeconds/3600, m.GenSeconds)
	fmt.Fprintf(&b, "Drivers: %v\n\n", a.Drivers)
	if len(a.Bench) > 0 {
		names := []string{}
		byBackend := map[string]map[string]OpStat{}
		order := []string{}
		for _, r := range a.Bench {
			names = append(names, r.Backend)
			byBackend[r.Backend] = map[string]OpStat{}
			for _, o := range r.Ops {
				byBackend[r.Backend][o.Name] = o
				if len(names) == 1 {
					order = append(order, o.Name)
				}
			}
		}
		fmt.Fprintf(&b, "#### Operations, p50 / p95 ms (write KiB per run)\n\n| operation |")
		for _, n := range names {
			fmt.Fprintf(&b, " %s |", n)
		}
		fmt.Fprintf(&b, "\n|---|")
		for range names {
			fmt.Fprintf(&b, "---|")
		}
		fmt.Fprintln(&b)
		for _, op := range order {
			fmt.Fprintf(&b, "| %s |", op)
			for _, n := range names {
				o, ok := byBackend[n][op]
				switch {
				case !ok:
					fmt.Fprintf(&b, " – |")
				case o.Err != "":
					fmt.Fprintf(&b, " ERR %s |", trunc(o.Err, 40))
				default:
					w := ""
					if o.WriteKB > 0 {
						w = fmt.Sprintf(" (%.0f)", o.WriteKB)
					}
					fmt.Fprintf(&b, " %.1f / %.1f%s |", o.P50, o.P95, w)
				}
			}
			fmt.Fprintln(&b)
		}
		fmt.Fprintf(&b, "\n#### Memory (MB RSS; peak = VmHWM)\n\n| backend | start | after open | after reads | end | peak |\n|---|---|---|---|---|---|\n")
		for _, r := range a.Bench {
			fmt.Fprintf(&b, "| %s | %.0f | %.0f | %.0f | %.0f | %.0f |\n", r.Backend, r.RSSMB["start.rss"], r.RSSMB["afterOpen.rss"], r.RSSMB["afterReads.rss"], r.RSSMB["end.rss"], r.RSSMB["end.peak"])
		}
	}
	for _, r := range a.Bench {
		if v := r.Notes["openBreakdownMs"]; v != "" && r.Backend == "json" {
			fmt.Fprintf(&b, "\nJSON open breakdown (last run, ms): %s\n", v)
		}
	}
	fmt.Fprintf(&b, "\n#### Index build from the JSON files (seconds)\n\n")
	for _, bd := range a.Builds {
		fmt.Fprintf(&b, "- %v: total %.2f s, peak RSS %.0f MB, stages %v\n", bd["backend"], bd["seconds"], bd["peakRSSMB"], bd["stages"])
	}
	fmt.Fprintf(&b, "\n#### Disk (MiB)\n\nJSON project: %s MiB in %d files (zip %s MiB). By kind:\n\n", mb(a.Disk.JSONBytes), a.Disk.JSONFiles, mb(a.Disk.JSONZip))
	kinds := []string{}
	for k := range a.Disk.ByKindBytes {
		kinds = append(kinds, k)
	}
	sort.Strings(kinds)
	for _, k := range kinds {
		fmt.Fprintf(&b, "- %s: %s MiB\n", k, mb(a.Disk.ByKindBytes[k]))
	}
	for k, v := range a.Disk.DB {
		fmt.Fprintf(&b, "- index-%s.db: %s MiB (zip %s MiB)\n", k, mb(v), mb(a.Disk.DBZip[k]))
	}
	fmt.Fprintf(&b, "\n#### Reads while another process writes (4 readers, writer commits one mark every 20 ms)\n\n| backend | writer in other process | op | alone p50/p95 | with writer p50/p95 | read errors | writer commits (p50/p95 ms) | writer errors |\n|---|---|---|---|---|---|---|---|\n")
	for _, c := range a.Conc {
		for _, op := range []string{"loadChapterAlignment", "listMarks"} {
			al, ww := c.ReadAlone[op], c.ReadWithW[op]
			fmt.Fprintf(&b, "| %s | %v | %s | %.1f / %.1f | %.1f / %.1f | %d | %d (%.1f / %.1f) | %d %s |\n", c.Backend, c.Separate, op, al.P50, al.P95, ww.P50, ww.P95, ww.Errors, c.Writer.N, c.Writer.P50, c.Writer.P95, c.Writer.Errors, trunc(c.FirstWriteEr+c.FirstReadEr, 60))
		}
	}
	fmt.Fprintf(&b, "\n#### kill -9 mid-write\n\n| backend | kills | consistent | torn/unparseable | mixed versions | lost acked commit | open failed | integrity failed | stray .tmp |\n|---|---|---|---|---|---|---|---|---|\n")
	for _, c := range a.Crash {
		fmt.Fprintf(&b, "| %s | %d | %d | %d | %d | %d | %d | %d | %d |\n", c.Backend, c.Kills, c.Consistent, c.Torn, c.Inconsistent, c.LostAcked, c.OpenFailed, c.IntegrityFailed, c.StrayTmp)
	}
	return b.String()
}

func trunc(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
