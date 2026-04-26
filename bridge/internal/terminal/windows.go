//go:build windows

package terminal

import (
	"fmt"
	"os/exec"
)

type windowsSpawner struct{}

func newSystem() Spawner { return windowsSpawner{} }

func (windowsSpawner) Run(cwd, cmd string) (string, error) {
	if path, err := exec.LookPath("wt.exe"); err == nil {
		c := exec.Command(path, "-d", cwd, "cmd", "/K", cmd)
		if err := c.Start(); err == nil {
			return "wt", nil
		}
	}
	if path, err := exec.LookPath("cmd.exe"); err == nil {
		c := exec.Command(path, "/C", "start", "cmd", "/K", "cd /d "+cwd+" && "+cmd)
		if err := c.Start(); err == nil {
			return "cmd", nil
		}
	}
	return "", fmt.Errorf("no terminal available on Windows")
}
