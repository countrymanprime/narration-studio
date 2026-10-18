package main

import (
	"fmt"

	"github.com/ncruces/go-sqlite3/vfs"
)

// printInfo says which locking features the ncruces build has on this platform and which SQLite each driver embeds.
func printInfo(dir string) {
	fmt.Println("ncruces vfs: SupportsFileLocking =", vfs.SupportsFileLocking, " SupportsSharedMemory =", vfs.SupportsSharedMemory)
	for _, be := range []string{"modernc", "ncruces"} {
		db, err := openDB(dir, be, 1)
		if err != nil {
			fmt.Println(be, "open:", err)
			continue
		}
		var v, mode string
		_ = db.QueryRow(`select sqlite_version()`).Scan(&v)
		_ = db.QueryRow(`PRAGMA journal_mode`).Scan(&mode)
		fmt.Printf("%s: SQLite %s, journal_mode=%s\n", be, v, mode)
		db.Close()
	}
}
