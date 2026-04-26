package agents

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// PortInfo describes the local process listening on a TCP port.
type PortInfo struct {
	Port    int    `json:"port"`
	Pid     int    `json:"pid"`
	Cwd     string `json:"cwd"`
	Command string `json:"command,omitempty"`
}

// DetectPort returns the listening process and its cwd for a TCP port.
// macOS / Linux use lsof; Windows is unsupported in MVP.
func DetectPort(ctx context.Context, port int) (*PortInfo, error) {
	switch runtime.GOOS {
	case "darwin", "linux":
		return detectPortLsof(ctx, port)
	default:
		return nil, errors.New("port detection not implemented on " + runtime.GOOS)
	}
}

func detectPortLsof(ctx context.Context, port int) (*PortInfo, error) {
	c, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	// 1) PID + COMMAND of listener.
	out, err := exec.CommandContext(c,
		"lsof", "-nP", "-iTCP:"+strconv.Itoa(port), "-sTCP:LISTEN", "-Fpcn",
	).Output()
	if err != nil {
		return nil, fmt.Errorf("lsof port: %w", err)
	}
	pid, command := parseLsofF(string(out))
	if pid == 0 {
		return nil, errors.New("no process listening on port")
	}

	// 2) cwd of that PID.
	out2, err := exec.CommandContext(c,
		"lsof", "-a", "-p", strconv.Itoa(pid), "-d", "cwd", "-Fn",
	).Output()
	if err != nil {
		return nil, fmt.Errorf("lsof cwd: %w", err)
	}
	cwd := parseLsofCwd(string(out2))
	if cwd == "" {
		return nil, errors.New("could not determine process cwd")
	}

	return &PortInfo{Port: port, Pid: pid, Cwd: cwd, Command: command}, nil
}

// parseLsofF reads `lsof -F pcn` output and returns the first listener PID.
// Format: lines starting with 'p' for PID, 'c' for command, 'n' for name.
func parseLsofF(s string) (int, string) {
	var pid int
	var cmd string
	for _, line := range strings.Split(s, "\n") {
		if len(line) == 0 {
			continue
		}
		switch line[0] {
		case 'p':
			if v, err := strconv.Atoi(line[1:]); err == nil && pid == 0 {
				pid = v
			}
		case 'c':
			if cmd == "" {
				cmd = line[1:]
			}
		}
	}
	return pid, cmd
}

func parseLsofCwd(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(line, "n") {
			return line[1:]
		}
	}
	return ""
}
