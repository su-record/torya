//go:build darwin

package terminal

import (
	"fmt"
	"os/exec"
	"strings"
)

type darwinSpawner struct{}

func newSystem() Spawner { return darwinSpawner{} }

func (darwinSpawner) Run(cwd, cmd string) (string, error) {
	// Prefer iTerm if installed.
	if _, err := exec.LookPath("osascript"); err == nil {
		// Use Terminal.app — most universal.
		script := fmt.Sprintf(
			`tell application "Terminal" to do script "cd %s && %s"`+
				"\ntell application \"Terminal\" to activate",
			quoteAppleScript(cwd), escapeAppleScript(cmd),
		)
		c := exec.Command("osascript", "-e", script)
		if err := c.Run(); err != nil {
			return "", err
		}
		return "Terminal.app", nil
	}
	return "", fmt.Errorf("osascript not available")
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
