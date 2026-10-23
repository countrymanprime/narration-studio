# spike-storage

Throwaway benchmark behind [the storage engine note](../../../../../docs/research/storage-engine-spike.md). It is its own Go module, so `src/studio/desktop/go.mod` and `go.sum` do not change, and nothing imports it. It imports the app's `internal` packages (`persist`, `findings`, `evidence`, `coverage`, `marks`, `measure`) through a `replace` to `../..`, which Go allows because this directory sits under the app's module path.

```text
CGO_ENABLED=0 go build -o spike .
./spike all -dir <empty folder> -scale full -out results.json   # tiny | full | max | stress
./spike info -dir <folder>                                       # driver locking features and SQLite versions
```

`all` generates the project, builds each index from the JSON files, runs every operation in a fresh process per backend, then the concurrent-writer and `kill` tests. Windows numbers come from the manual `Storage spike (Windows)` workflow. The Linux outputs of the run in the note are in `results/`.
