//go:build darwin

package handler

import (
	"os/exec"
	"strings"
)

func pickFolderDarwin(title string) (string, error) {
	if title == "" {
		title = "Select project folder"
	}
	script := `POSIX path of (choose folder with prompt "` + escapeAS(title) + `")`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimRight(strings.TrimSpace(string(out)), "/"), nil
}

func escapeAS(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}
