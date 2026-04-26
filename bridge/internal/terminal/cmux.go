package terminal

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// CmuxAvailable returns true when the cmux CLI is on PATH and `cmux ping`
// returns success — i.e. the cmux app is running and its socket is reachable.
//
// The protocol with cmux's daemon is mediated entirely through the `cmux`
// binary; we never speak the raw socket ourselves. That keeps Torya forward-
// compatible with cmux's internal v2 RPC migrations.
func CmuxAvailable() bool {
	if _, err := exec.LookPath("cmux"); err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	return exec.CommandContext(ctx, "cmux", "ping").Run() == nil
}

// cmuxSpawner opens a new cmux workspace at cwd and runs the agent inside
// it. cmux's `new-workspace --command <text>` command sends the text to the
// new surface (with a trailing newline), so we wrap the agent invocation in
// an exit-code marker and poll the marker file for completion.
type cmuxSpawner struct{}

func Cmux() Spawner { return cmuxSpawner{} }

func (cmuxSpawner) Run(cwd, cmd string) (string, <-chan int, error) {
	if _, err := exec.LookPath("cmux"); err != nil {
		return "", nil, fmt.Errorf("cmux not on PATH")
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
	if err := exec.Command("cmux", args...).Run(); err != nil {
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

