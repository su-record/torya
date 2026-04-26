package terminal

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// runMarkerDir is the per-host directory where a wrapped agent run drops
// its exit-code marker file. Used by spawners that hand the agent off to a
// detached process tree (cmux workspaces, Terminal.app windows) and so
// can't os.Wait() on it directly.
func runMarkerDir() (string, error) {
	dir := filepath.Join(os.TempDir(), "torya-runs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

// waitForMarker polls path until the wrapped command writes a numeric exit
// code there, then sends it on done. A 24h ceiling stops abandoned runs
// from leaking goroutines.
func waitForMarker(path string, done chan<- int) {
	defer close(done)
	defer os.Remove(path)
	deadline := time.Now().Add(24 * time.Hour)
	for {
		if time.Now().After(deadline) {
			done <- -1
			return
		}
		if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
			line := strings.TrimSpace(string(data))
			if code, err := strconv.Atoi(line); err == nil {
				done <- code
				return
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
}

// shellQuote single-quotes a path/word for safe shell inclusion.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'"
}
