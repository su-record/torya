package terminal

import (
	"os/exec"
	"syscall"
)

// silentSpawner runs the command via /bin/sh without opening any GUI terminal.
// Stdout/stderr are discarded for now — the agent run still records its own
// output (e.g. claude writes to ~/.claude/sessions). The process is detached
// so it survives this bridge process exit.
type silentSpawner struct{}

func Silent() Spawner { return silentSpawner{} }

func (silentSpawner) Run(cwd, cmd string) (string, error) {
	c := exec.Command("/bin/sh", "-c", cmd)
	c.Dir = cwd
	c.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := c.Start(); err != nil {
		return "", err
	}
	go func() { _ = c.Wait() }()
	return "silent", nil
}
