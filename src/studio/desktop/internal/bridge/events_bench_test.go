package bridge

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// BenchmarkDispatchByLogSize is the cost of one host tick (Client.Dispatch) when nothing new arrived, as events.log grows. The log is
// append-only for the length of a session (about 150 to 200 KB an hour), and every tick reads it whole, so this is the per-tick cost a long
// session pays. Not part of the gate: go test -run ^$ -bench DispatchByLogSize ./internal/bridge
func BenchmarkDispatchByLogSize(b *testing.B) {
	line := EncodeFields([]string{"PROJECT_STATUS", "", "C:/Projects/Book/Book.rpp", "0", "1234", "1", "62.500000"}) + "\n"
	for _, kb := range []int{0, 200, 1024, 8192} {
		b.Run(fmt.Sprintf("log_%dKB", kb), func(b *testing.B) {
			dir := b.TempDir()
			client, err := New(dir)
			if err != nil {
				b.Fatal(err)
			}
			content := make([]byte, 0, kb*1024+len(line))
			for len(content) < kb*1024 {
				content = append(content, line...)
			}
			if err := os.WriteFile(filepath.Join(dir, "events.log"), content, 0o644); err != nil {
				b.Fatal(err)
			}
			if err := client.Dispatch(); err != nil {
				b.Fatal(err)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := client.Dispatch(); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
