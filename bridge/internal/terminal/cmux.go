package terminal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Well-known install locations for the cmux CLI. Chrome spawns the Native
// Messaging host with a minimal PATH (no /opt/homebrew, no /Applications),
// so a plain exec.LookPath usually misses cmux even when the user's
// interactive shell can find it. We probe these paths as a fallback.
var cmuxFallbackPaths = []string{
	"/Applications/cmux.app/Contents/Resources/bin/cmux",
	"/Applications/cmux.app/Contents/MacOS/cmux",
	"/opt/homebrew/bin/cmux",
	"/usr/local/bin/cmux",
}

func cmuxBin() (string, error) {
	if p, err := exec.LookPath("cmux"); err == nil {
		return p, nil
	}
	if home, err := os.UserHomeDir(); err == nil {
		// Per-user install variants live under ~/.
		for _, p := range []string{
			filepath.Join(home, "Applications/cmux.app/Contents/Resources/bin/cmux"),
			filepath.Join(home, ".local/bin/cmux"),
		} {
			if isExecFile(p) {
				return p, nil
			}
		}
	}
	for _, p := range cmuxFallbackPaths {
		if isExecFile(p) {
			return p, nil
		}
	}
	return "", fmt.Errorf("cmux CLI not found")
}

func isExecFile(p string) bool {
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		return false
	}
	return st.Mode()&0o111 != 0
}

// CmuxStatus describes why cmux is or isn't usable. Surfaced to the
// extension as progress data so the user can see why a cmux run fell
// back to the system terminal (yellow banner without a clear cause is
// the worst dev UX).
type CmuxStatus struct {
	Available bool
	Bin       string
	Reason    string
}

func CheckCmux() CmuxStatus {
	bin, err := cmuxBin()
	if err != nil {
		return CmuxStatus{Reason: "cmux CLI not found in PATH or known install locations"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, "ping").CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return CmuxStatus{Bin: bin, Reason: fmt.Sprintf("cmux ping failed: %s", msg)}
	}
	return CmuxStatus{Available: true, Bin: bin}
}

// CmuxAvailable is the boolean shortcut around CheckCmux.
func CmuxAvailable() bool { return CheckCmux().Available }

// cmuxSpawner opens a new cmux workspace at cwd and runs the agent inside
// it. cmux's `new-workspace --command <text>` command sends the text to the
// new surface (with a trailing newline), so we wrap the agent invocation in
// an exit-code marker and poll the marker file for completion.
type cmuxSpawner struct{}

func Cmux() Spawner { return cmuxSpawner{} }

func (cmuxSpawner) Run(cwd, cmd string) (string, <-chan int, error) {
	bin, err := cmuxBin()
	if err != nil {
		return "", nil, err
	}
	dir, err := runMarkerDir()
	if err != nil {
		return "", nil, err
	}
	marker := filepath.Join(dir, fmt.Sprintf("cmux-%d.exit", time.Now().UnixNano()))
	wrapped := fmt.Sprintf("(%s); echo $? > %s", cmd, shellQuote(marker))

	args := []string{
		"new-workspace",
		"--cwd", cwd,
		"--name", "torya: " + summarizePrompt(cmd),
		"--command", wrapped,
	}
	if err := exec.Command(bin, args...).Run(); err != nil {
		return "", nil, fmt.Errorf("cmux new-workspace: %w", err)
	}

	done := make(chan int, 1)
	go waitForMarker(marker, done)
	return "cmux", done, nil
}

// summarizePrompt produces a short tab title from the wrapped command. We
// strip the agent invocation prefix and trim quotes for readability.
func summarizePrompt(cmd string) string {
	s := cmd
	for _, prefix := range []string{
		"claude --permission-mode acceptEdits -p ",
		"claude -p ",
		"codex exec ",
		"gemini -p ",
	} {
		if strings.HasPrefix(s, prefix) {
			s = strings.TrimPrefix(s, prefix)
			break
		}
	}
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "'\"")
	if i := strings.IndexAny(s, "\n\r"); i >= 0 {
		s = s[:i]
	}
	if len(s) > 48 {
		s = s[:47] + "…"
	}
	return s
}

