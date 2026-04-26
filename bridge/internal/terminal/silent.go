package terminal

import (
	"os"
	"os/exec"
	"syscall"
)

// silentSpawner runs the command via /bin/sh without opening any GUI terminal.
//
// CRITICAL: stdin/stdout/stderr MUST be detached from the parent bridge
// process. The bridge talks to the browser extension over its own stdio
// (Native Messaging framing), so any byte written by the child to the
// inherited stdout would corrupt the NM stream and kill the connection
// after the first run. We point the child at /dev/null instead.
//
// The process is also setsid'd so it survives this bridge process exit.
type silentSpawner struct{}

func Silent() Spawner { return silentSpawner{} }

func (silentSpawner) Run(cwd, cmd string) (string, <-chan int, error) {
	c, null, err := startSilent(cwd, cmd)
	if err != nil {
		return "", nil, err
	}
	done := make(chan int, 1)
	go func() {
		defer close(done)
		defer null.Close()
		err := c.Wait()
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				done <- exitErr.ExitCode()
				return
			}
			done <- -1
			return
		}
		done <- c.ProcessState.ExitCode()
	}()
	return "silent", done, nil
}

func startSilent(cwd, cmd string) (*exec.Cmd, *os.File, error) {
	null, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	if err != nil {
		return nil, nil, err
	}
	c := exec.Command("/bin/sh", "-c", cmd)
	c.Dir = cwd
	c.Stdin = null
	c.Stdout = null
	c.Stderr = null
	c.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := c.Start(); err != nil {
		_ = null.Close()
		return nil, nil, err
	}
	return c, null, nil
}
