//go:build linux

package terminal

import (
	"fmt"
	"os/exec"
)

type linuxSpawner struct{}

func newSystem() Spawner { return linuxSpawner{} }

func (linuxSpawner) Run(cwd, cmd string) (string, error) {
	candidates := []struct {
		bin  string
		args func(cwd, cmd string) []string
	}{
		{"gnome-terminal", func(cwd, cmd string) []string {
			return []string{"--working-directory=" + cwd, "--", "bash", "-lc", cmd + "; exec bash"}
		}},
		{"konsole", func(cwd, cmd string) []string {
			return []string{"--workdir", cwd, "-e", "bash", "-lc", cmd + "; exec bash"}
		}},
		{"xterm", func(cwd, cmd string) []string {
			return []string{"-e", "bash", "-lc", "cd " + cwd + " && " + cmd + "; exec bash"}
		}},
		{"x-terminal-emulator", func(cwd, cmd string) []string {
			return []string{"-e", "bash", "-lc", "cd " + cwd + " && " + cmd + "; exec bash"}
		}},
	}
	for _, c := range candidates {
		path, err := exec.LookPath(c.bin)
		if err != nil {
			continue
		}
		if err := exec.Command(path, c.args(cwd, cmd)...).Start(); err == nil {
			return c.bin, nil
		}
	}
	return "", fmt.Errorf("no usable terminal emulator")
}
