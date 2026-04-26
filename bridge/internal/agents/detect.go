// Package agents detects available coding agent CLIs on the host.
package agents

import (
	"context"
	"net"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type Info struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Path      string `json:"path,omitempty"`
	Version   string `json:"version,omitempty"`
	RPC       string `json:"rpc,omitempty"`
}

// Known agent CLIs we look for on the user's PATH.
var cliAgents = []string{"claude", "codex", "gemini"}

func DetectAll(ctx context.Context) []Info {
	out := make([]Info, 0, len(cliAgents)+1)
	for _, name := range cliAgents {
		out = append(out, detectCLI(ctx, name))
	}
	out = append(out, detectCmux())
	return out
}

func detectCLI(ctx context.Context, name string) Info {
	path, err := exec.LookPath(name)
	if err != nil {
		// Try known install locations as a fallback.
		for _, p := range knownPaths(name) {
			if _, err := exec.LookPath(p); err == nil {
				path = p
				break
			}
		}
	}
	if path == "" {
		return Info{Name: name, Available: false}
	}
	return Info{
		Name:      name,
		Available: true,
		Path:      path,
		Version:   runVersion(ctx, path),
	}
}

func runVersion(ctx context.Context, path string) string {
	cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, path, "--version")
	b, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func detectCmux() Info {
	addr := "127.0.0.1:7878"
	conn, err := net.DialTimeout("tcp", addr, 250*time.Millisecond)
	if err != nil {
		return Info{Name: "cmux", Available: false}
	}
	_ = conn.Close()
	return Info{Name: "cmux", Available: true, RPC: "ws://" + addr}
}

func knownPaths(name string) []string {
	home, _ := homeDir()
	switch runtime.GOOS {
	case "darwin", "linux":
		return []string{
			home + "/.local/bin/" + name,
			home + "/.bun/bin/" + name,
			"/opt/homebrew/bin/" + name,
			"/usr/local/bin/" + name,
		}
	case "windows":
		return []string{
			home + `\AppData\Local\Programs\` + name + `\` + name + ".exe",
		}
	}
	return nil
}
