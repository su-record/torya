//go:build darwin

package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type darwinSpawner struct{}

func newSystem() Spawner { return darwinSpawner{} }

// Run opens Terminal.app, runs the agent there, and returns a `done` channel
// that emits the agent's exit code when it finishes.
//
// Terminal.app is a separate app; the spawned shell is not our child, so we
// can't os.Wait() on it. We work around this by appending a tiny shell
// epilogue to the command that writes the exit code to a per-run marker
// file, then watching that file from the bridge side.
func (darwinSpawner) Run(cwd, cmd string) (string, <-chan int, error) {
	if _, err := exec.LookPath("osascript"); err != nil {
		return "", nil, fmt.Errorf("osascript not available")
	}
	dir, err := runMarkerDir()
	if err != nil {
		return "", nil, err
	}
	marker := filepath.Join(dir, fmt.Sprintf("run-%d.exit", time.Now().UnixNano()))
	// `(<cmd>)` so the exit status reflects the wrapped pipeline; redirect $?
	// to the marker file. We deliberately leave the shell open after so the
	// user can inspect the agent's output before closing Terminal.
	wrapped := fmt.Sprintf("(%s); echo $? > %s", cmd, shellQuote(marker))
	script := fmt.Sprintf(
		`tell application "Terminal" to do script "cd %s && %s"`+
			"\ntell application \"Terminal\" to activate",
		quoteAppleScript(cwd), escapeAppleScript(wrapped),
	)
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		_ = os.Remove(marker)
		return "", nil, err
	}

	done := make(chan int, 1)
	go waitForMarker(marker, done)
	return "Terminal.app", done, nil
}

func quoteAppleScript(s string) string {
	return `\"` + strings.ReplaceAll(s, `"`, `\\\"`) + `\"`
}

func escapeAppleScript(s string) string {
	// Inside the outer "..." in 'do script' we need to escape backslashes and quotes.
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

