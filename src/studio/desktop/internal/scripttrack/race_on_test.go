//go:build race

package scripttrack

// raceSlowdown scales a wall-clock budget under the race detector, which runs the search about twenty times slower.
const raceSlowdown = 20
