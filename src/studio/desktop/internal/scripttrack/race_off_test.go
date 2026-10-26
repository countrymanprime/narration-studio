//go:build !race

package scripttrack

// raceSlowdown scales a wall-clock budget under the race detector; without it a budget stands as written.
const raceSlowdown = 1
