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
	port := 5173
	if len(os.Args) > 1 {
		fmt.Sscanf(os.Args[1], "%d", &port)
	}
	cmd := exec.Command("./dist/torya-bridge")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = os.Stderr
	cmd.Start()
	defer func() { stdin.Close(); cmd.Wait() }()

	send := func(r req) {
		b, _ := json.Marshal(r)
		var h [4]byte
		binary.LittleEndian.PutUint32(h[:], uint32(len(b)))
		stdin.Write(h[:]); stdin.Write(b)
	}
	go func() {
		for {
			var h [4]byte
			if _, err := io.ReadFull(stdout, h[:]); err != nil { return }
			n := binary.LittleEndian.Uint32(h[:])
			b := make([]byte, n)
			io.ReadFull(stdout, b)
			fmt.Println("◀", string(b))
		}
	}()
	send(req{V: 1, ID: "1", Cmd: "detect-project", Args: map[string]any{"port": port}})
	time.Sleep(2 * time.Second)
}
