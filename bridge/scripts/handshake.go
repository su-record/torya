// scripts/handshake.go is a developer-only helper that drives the bridge
// binary over stdin/stdout with proper Native Messaging framing. It sends a
// few commands and prints responses so we can verify the bridge end-to-end
// without involving Chrome.
//
//   go run ./scripts/handshake.go            # uses ./dist/torya-bridge
//   BRIDGE_PATH=/path/to/torya-bridge go run ./scripts/handshake.go
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

type req struct {
	V    int    `json:"v"`
	ID   string `json:"id"`
	Cmd  string `json:"cmd"`
	Args any    `json:"args,omitempty"`
}

func main() {
	bridge := os.Getenv("BRIDGE_PATH")
	if bridge == "" {
		bridge = "./dist/torya-bridge"
	}

	cmd := exec.Command(bridge)
	stdin, err := cmd.StdinPipe()
	must(err)
	stdout, err := cmd.StdoutPipe()
	must(err)
	cmd.Stderr = os.Stderr
	must(cmd.Start())
	defer func() {
		_ = stdin.Close()
		_ = cmd.Wait()
	}()

	send := func(r req) {
		body, _ := json.Marshal(r)
		var hdr [4]byte
		binary.LittleEndian.PutUint32(hdr[:], uint32(len(body)))
		_, _ = stdin.Write(hdr[:])
		_, _ = stdin.Write(body)
	}

	go func() {
		for {
			var hdr [4]byte
			if _, err := io.ReadFull(stdout, hdr[:]); err != nil {
				return
			}
			n := binary.LittleEndian.Uint32(hdr[:])
			body := make([]byte, n)
			if _, err := io.ReadFull(stdout, body); err != nil {
				return
			}
			fmt.Println("◀", string(body))
		}
	}()

	send(req{V: 1, ID: "1", Cmd: "ping"})
	time.Sleep(150 * time.Millisecond)
	send(req{V: 1, ID: "2", Cmd: "detect-agents"})
	time.Sleep(3500 * time.Millisecond)
	send(req{V: 1, ID: "3", Cmd: "set-workspaces", Args: map[string]any{
		"workspaces": []map[string]string{
			{"id": "w1", "rootPath": "/tmp"},
		},
	}})
	time.Sleep(200 * time.Millisecond)
	send(req{V: 1, ID: "4", Cmd: "read-file", Args: map[string]any{"path": "/tmp/torya-handshake-not-exist.txt"}})
	time.Sleep(200 * time.Millisecond)
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
